# Resend notifications

This provider sends the existing Medusa notifications using Resend 6.26.0. It renders Spanish usapeek HTML and plain text locally; no Resend-hosted templates are needed. The allowlist includes `auth-email-verification`, `auth-password-reset`, `vendor-application-submitted`, `vendor-application-changes_requested`, `vendor-application-approved`, `vendor-application-rejected`, `order-confirmed`, and `order-shipped`.

## Configuration

Keep backend configuration in the ignored root `.env` locally and the API/worker environment in deployments.

| Variable             | Purpose                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_EMAIL_ENABLED` | Only the exact value `true` registers outbound email. Otherwise only the local `feed` channel is configured.                                                              |
| `RESEND_API_KEY`     | Required when enabled; must be a valid Resend sending key with access to the sender domain. Startup validates its syntax; Resend validates authorization during delivery. |
| `RESEND_FROM_EMAIL`  | Required single sender address, optionally `usapeek <correo@your-domain.example>`. No per-notification sender overrides.                                           |
| `AUTH_EMAIL_FROM`    | Backward-compatible fallback only when `RESEND_FROM_EMAIL` is absent. Both auth and vendor notifications use the same resolved sender.                                    |
| `NODE_ENV`           | `production` rejects `resend.dev` and its subdomains as senders.                                                                                                          |
| `STOREFRONT_URL`     | Public customer application origin for verification/reset and private order tracking URLs.                                                                                |
| `JWT_SECRET`         | Existing backend signing secret, also used with a separate purpose to sign private tracking links. Rotation invalidates existing links.                                   |
| `ADMIN_URL`          | Public operator application origin for verification/reset URLs.                                                                                                           |
| `VENDOR_URL`         | Public vendor application origin for verification/reset URLs.                                                                                                             |

Resend requires a verified sender domain for delivery to general recipients. The `onboarding@resend.dev` testing sender can only send to the Resend account owner's email; a valid key alone does not unlock customer delivery. Configure a domain that the operator owns, publish the DNS records Resend supplies, wait for verification, and use a sender on that verified domain. The application cannot verify domain ownership from the address alone; the production startup gate rejects the known testing domain and Resend enforces actual verification. No credentials or domain changes are made by this module.

Lifecycle payloads remain `{ application_id, status, reason }`. They identify the application and explain where to continue in the customer account or vendor portal. They do not derive mutable action URLs from environment variables during a retry. Auth action URLs come from the existing event handling and are checked for HTTP(S), no embedded credentials, and escaped HTML attributes. Plain text preserves literal URLs and feedback, because HTML entity encoding would corrupt a plain text message.

## Delivery and recovery

- All emails use the existing Medusa Notification Module. The vendor event outbox remains responsible for its claims, five delivery attempts, and `sent`/`failed` state.
- The vendor notification job checks configuration before starting workflows. Each minute it processes at most 20 successful deliveries, stops at the first empty claim, and stops after a failed delivery so the same event is not retried repeatedly within that run. Workflow failures produce a sanitized warning and wait for the next schedule. This removes empty-loop work; it does not eliminate native BullMQ polling or restore an exhausted Redis quota.
- Auth keys hash the email kind, actor, recipient, and verification/reset secret. Vendor keys use the existing event ID. Resend receives a hash of the notification key through the SDK's second `send` argument; neither keys nor errors expose auth tokens.
- Order confirmations subscribe to native `order.placed`, which the installed Mercur split checkout emits for every seller order as well as Medusa's normal checkout. The workflow reads the order's recipient and reference, skips missing recipients and canceled/draft orders, honors `no_notification` when provided, and deduplicates with `order-confirmed:<order-id>`. It sends one email per seller order without subscribing again to the group event.
- Shipment notifications use the fulfillment ID for deduplication. The workflow verifies shipped, non-canceled fulfillment/order state and honors `no_notification`. Its payload includes the same customer-facing order reference, a private order URL, and tracking numbers.
- Both order emails use `/orders/track#token=...` on `STOREFRONT_URL`, without requiring login or the checkout receipt cookie. The fragment keeps the bearer token out of ordinary HTTP access logs and referrers; the tracking view passes it in a request body. Links grant read-only tracking for a single order, expire after 90 days, and bind to the current order recipient. The confirmation expiration is anchored to `order.created_at`; shipment expiration is anchored to `fulfillment.shipped_at`, so retries retain the same signed URL and message body. Do not share or log these links. This change does not send historical confirmation emails or add an email resend operation.
- The shared adapter acquires the configured Medusa distributed lock per key. It returns a persisted success on replay, preserves a failed row's ID when retrying, and checks persisted success if Medusa returns no row. The ID and filter compatibility handling is specific to installed Medusa 2.18, whose public types omit fields supported by its implementation.
- The SDK can resolve `{ error, data: null }` instead of rejecting. Both API errors and transport exceptions throw from this provider. An absent external message ID also fails. Vendor failures remain retryable in the existing outbox; auth failures propagate to the event bus.
- Redis event bus defaults now allow five attempts with exponential backoff starting at five seconds. This is a module-wide default, so other subscribers also inherit it unless the emitting event overrides its job options.
- Resend deduplicates accepted requests for 24 hours. Medusa persisted success provides longer-lived application deduplication. Do not assume provider deduplication survives a longer outage or changes to an already submitted message's body, sender, or template.
- A process crash after inserting a notification can leave it `pending`. The adapter deliberately does not call that success or send around it. Inspect the corresponding Medusa notification and Resend delivery evidence before operational recovery; reconcile accepted sends or explicitly recover unaccepted records. Automatic crash recovery of ambiguous pending records is not introduced here.
- A success means Resend accepted the email, not that the recipient's inbox received it. Live delivery, bounce handling, verified domain setup, and final infrastructure checks belong to the coordinator/operator.

Resend 6.26.0 itself logs raw API error objects to `console.error` outside production. Its supported constructor options are only `baseUrl` and `userAgent`, with no logger option. This module sanitizes its own errors but does not patch private SDK methods or global console behavior. Treat development SDK error logs as potentially sensitive; production disables that SDK logging automatically.

Mercur 2.3.3 `createSellerAccountWorkflow` and `approveSellerWorkflow` emit seller events without calling the Notification Module, and the installed core subscribers do not send additional seller lifecycle emails. The separate native seller invitation workflow uses another template and is intentionally outside this allowlist and task scope.

## Verification history

The order-email unit suites were removed at the user's request. They previously exercised native event selection, guest link payloads, persisted notification replay, retry identity, suppression/state guards, error propagation, template escaping and safe action URLs. They mocked delivery dependencies and did not send real emails. Their historical results do not establish current behavior, inbox delivery or a live sender domain.

Earlier provider unit suites were removed at the user's request. Those former suites mocked the Resend SDK; their retry fixtures exercised the installed Medusa notification service against an in-memory repository and simulated locking. Those earlier suites are no longer executable in this checkout.

The earlier implementation report recorded 46 passing tests across these three suites, API `tsc --noEmit`, and targeted ESLint without warnings. That is historical evidence, not verification of the current checkout/shipment flow or live delivery. The documentation refresh did not rerun application tests. Record new commands and results in [development progress](../../../../../docs/develpment/development-progress.md); current financial closure requirements are in the [audit](../../../../../docs/develpment/development-completion-audit.md).

References: [Resend sending API](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [domain verification](https://resend.com/docs/dashboard/domains/introduction), and the version-matched Mercur documentation in `node_modules/@mercurjs/docs`.
