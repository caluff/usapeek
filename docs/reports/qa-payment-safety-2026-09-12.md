# QA payment, email, and order safety audit — 2026-09-12

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Read-only audit of the current dirty workspace. Only this report was written; no remote records were queried or mutated, no emails sent, and no environment, server, migration, dependency, or code changes made. Source and installed packages were inspected rather than booting Medusa. Existing unrelated changes were preserved.

## Decision for the coordinator

Local configuration points to **Stripe test mode, real enabled email delivery, and remote database/Redis services**. These observations do not prove that the already running API/worker loaded these exact files or that the remote database is dedicated to QA. Do not treat a localhost frontend as an isolated environment.

Use only coordinator-authorized QA records, a controlled recipient inbox, and Stripe test payment details after confirming the active runtime's configuration and dataset ownership. The vendor shipment endpoint cannot be relied on to suppress email using `no_notification`: its installed validator does not include that property. Completing an order is a status mutation, not evidence of delivery or payment capture.

## Evidence and configuration snapshot

Loaded `building-with-medusa`, Orca orchestration/CLI skills, and Stripe best-practices/security guidance. Read installed `@mercurjs/docs` 2.3.3 order preparation, shipment, delivery, completion, and order-splitting documentation. Verified installed Mercur core 2.3.3 and Medusa 2.18.0; traced installed routes, validators, middleware, workflows, and application hook/subscriber consumers. No framework upgrade or new integration is proposed. Local installed implementation is authoritative where the user guide is broader than the installed API schema.

Only mode and presence were emitted while examining selected environment keys. No secret values, addresses, credentials, account IDs, or remote hostnames are included here.

| Local file / setting | Observed state | Consequence |
| --- | --- | --- |
| Root `.env`: `STRIPE_API_KEY` | Present; test mode | Source configuration accepts only test secret keys; live or restricted keys are rejected by the current implementation. |
| Root `.env`: `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYOUT_WEBHOOK_SECRET` | Both present | Presence does not prove valid signatures, matching endpoints, account ownership, or a running webhook forwarder. |
| Root `.env`: `STRIPE_AUTOMATIC_JOBS_ENABLED` | Disabled | Config passes `disabled: true` to the payout module. This is not a blanket prohibition on manually invoked payment/payout operations. |
| Web `.env.local`: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Present; test mode | Matching backend Stripe account was not verified. |
| Root `.env`: `AUTH_EMAIL_ENABLED` | Enabled | Registers the real Resend email provider when configuration validates. |
| Root `.env`: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Present | No local sink, recipient allowlist, or development dry-run exists in the provider's send implementation. Key validity and sender verification were not tested. |
| Root `.env`: `STOREFRONT_URL` | Present; local host | Shipment/auth links use this configured origin; recipients outside the local environment may not be able to open them. |
| Root `.env`: `DATABASE_URL`, `REDIS_URL` | Present; remote hosts | Product, cart, inventory, notification, and order changes would persist remotely; queues may be shared with other workers. |
| Web `.env.local`: backend URL / Medusa publishable key | Present; backend uses local host | Frontend locality does not establish storage isolation. |

No matching payment/email/database runtime variables were present in this audit shell's inherited environment. No alternative root `.env.development`, `.env.development.local`, `.env.local`, or API `.env`/`.env.local` files were found in the bounded check. This is not an inspection of another process's effective environment. `packages/api/medusa-config.ts` locates the workspace root and calls Medusa `loadEnv`; an existing process can still have different inherited configuration or older loaded code.

## Exact preconditions before mutation-based QA

1. Confirm the active API and worker belong to the intended workspace and dataset, and the coordinator has authorization to create QA data there. Confirm effective Stripe test mode, matching frontend/backend Stripe account, expected payment provider `pp_stripe_stripe`, and test webhook routing. File presence alone is insufficient.
2. Choose dedicated QA customer and seller accounts. Verify live seller membership, seller status `open`, and ownership of the warehouse and order. Do not use another customer's existing order or overwrite an existing catalog item to accelerate setup. Public seller registration remains disabled.
3. For order checkout, use a USD cart with a US shipping address, at least one offer-backed item, and no paused products. Every item's seller must have an active payout account whose stored Stripe data has a US country and account metadata matching the payout account. These are actual checks in `src/lib/stripe-connect/sale-readiness.ts`; skipping Stripe setup is not supported by the normal completion path.
4. Confirm the selected region enables the Stripe provider, the store/channel exposes the selected published product and offer, the offer has its proper USD price, and sufficient offer inventory exists in the seller's authorized warehouse. Use an applicable seller shipping option and a deliberately small quantity. Prices use display units; do not apply a cents conversion to Medusa prices.
5. Use only a controlled, authorized recipient for the cart/order email and any account reset, verification, or onboarding interaction. Under the current configuration, treat shipping as consent to a real email to `order.email`. There is no verified no-email vendor shipment path. A separate isolated runtime with email disabled could support that kind of QA, but changing or starting one was outside this worker's scope.
6. Keep automatic payout jobs disabled for this QA scope. Do not invoke capture, refund, payout, onboarding, or recovery operations merely to advance a visual status. If payment capture is a required test, scope it separately to the known QA payment and its full order group.
7. Before fulfillment, verify positive remaining quantities, seller-owned location, native reservations, and a safe/manual shipping provider. Fulfillment invokes the shipping provider and reduces stock; a provider must not create real carrier purchases. Separate shipping and non-shipping items into different fulfillments. A simple one-item, one-inventory-component order is the lowest-complexity first test; test partials/kits afterward.
8. Before shipment, reload the QA order and its active prepared fulfillment, verify it is neither canceled nor already shipped, and use deliberate test tracking data. Before completion, verify all required physical items were shipped and non-shipping items prepared; delivery remains an optional explicit action. Do not rely on the native completion endpoint to enforce these business preconditions.

## Money and email side effects

`src/lib/stripe-connect-configuration.ts` rejects non-test API keys and only enables Stripe when both webhook secrets are present. `medusa-config.ts` sets `capture: false` for the Stripe payment provider. Thus authorization and capture are distinct. The inspected fulfillment, shipment, and completion workflows do not invoke payment capture. Mercur nevertheless exposes a native vendor payment capture route and its payment-event processing workflow can call `capturePaymentWorkflow`; manual capture and webhook behavior are not disabled by the automatic payout-jobs switch. No live-money configuration was found in the bounded local inspection, but active runtime and remote Stripe objects remain unverified.

Mercur splits a cart into seller orders under an order group and keeps payment relationships at the cart/group boundary. Do not equate canceling one child order with refunding its share of a payment. Native cancellation is not a QA cleanup shortcut that guarantees a refund or reverses every external side effect.

`src/modules/resend/service.ts` calls `Resend.emails.send` for the requested recipient. Development mode is not a delivery sandbox. `src/subscribers/order-shipped.ts` handles `FulfillmentWorkflowEvents.SHIPMENT_CREATED`; `src/workflows/shipment-notification.ts` reads the fulfillment's actual owning order and sends to its email with idempotency key `shipment-created:<fulfillment id>`. It skips disabled email, explicit event suppression, canceled/unshipped/nonphysical fulfillments, canceled orders, and missing recipients. Delivery failure propagates for retry; the configured event bus permits five attempts with exponential backoff. Idempotency avoids duplicate successful sends; it does not make sending harmless.

**Suppression mismatch:** Mercur's user guide describes notification selection, but installed `VendorCreateShipment` only validates `items` and optional `labels`; `no_notification` is absent. The route passes `validatedBody` into Medusa, so adding an extra suppression property is not a reliable route-level control. The unit test for an already-suppressed workflow event does not prove a vendor HTTP caller can produce that event. The preparation validator also does not expose a suppression property.

Account verification/password-reset subscribers and vendor-application notification workflows are additional real-email paths. Product/offer mutations can also trigger `algolia-catalog-changed.ts` and write to search when that module is configured; this audit did not establish search isolation.

## Native order flow and request shapes

All paths below are POST under `/vendor/orders/:id`, using authenticated vendor membership, `x-seller-id`, native policies, and seller-order validation. Do not call module mutations directly or fabricate fulfillment/status records.

| Action | Suffix and installed input | Workflow / actual effect |
| --- | --- | --- |
| Prepare | `/fulfillments`; `{ items: [{ id, quantity }], requires_shipping, location_id }` | Mercur `createOrderFulfillmentWorkflow`: validates order/items and shipping grouping, resolves shipping option/provider, creates fulfillment with `packed_at`, adjusts inventory/reservations, links it to the order, emits fulfillment-created. `id` refers to an order line. The schema permits zero but QA should use positive quantities. |
| Ship | `/fulfillments/:fulfillment_id/shipments`; `{ items: [{ id, quantity }], labels?: [{ tracking_number, tracking_url, label_url }] }` | Medusa `createOrderShipmentWorkflow`: verifies fulfillment belongs to order, marks it shipped, registers shipped quantities, emits shipment-created (and therefore the application email path). All three label fields are required when supplying a label. |
| Deliver | `/fulfillments/:fulfillment_id/mark-as-delivered`; empty body | `markOrderFulfillmentAsDeliveredWorkflow`; records delivery explicitly. Does not mean the order has been completed. |
| Complete | `/complete`; empty body | `completeOrderWorkflow`, then `completeOrdersStep` / order module `completeOrder`; writes `completed`, emits order-completed, exposes `ordersCompleted` hook. The inspected order service rejects canceled orders but does not require shipment, delivery, or captured payment. |
| Cancel preparation | `/fulfillments/:fulfillment_id/cancel` | Native cancel-fulfillment route; use only a dedicated eligible QA fulfillment. Do not confuse it with canceling/refunding the order. |
| Cancel order | `/cancel` | Native cancellation; keep payment/refund handling separate. |

The current vendor application re-reads the order and checks readiness in `apps/vendor/src/features/orders/operations.ts`; those UI/server-action constraints are stricter than the native completion service. `docs/orders-flow.md` documents the application presentation groups. No application or Mercur handlers for `fulfillmentCreated`, `shipmentCreated`, or `ordersCompleted` were found in the searched source; the shipment email is an event subscriber, not a workflow-hook replacement.

Partial fulfillments are supported. Installed shipment registration derives quantities from the fulfillment and variant inventory relations, while Mercur preparation uses offer inventory relations. Do not substitute fulfillment component quantities for purchased units; kit/required-quantity scenarios deserve a separate end-to-end test rather than extrapolation from a simple product.

## Existing creation and operational patterns

- **Product:** existing `vendorOperations.createProduct` in `apps/vendor/src/features/workspace/operations.ts` builds `createCatalogBody` and sends through `scopedClient` to `/vendor/products`. The backend catalog middleware runs `validateVendorCatalogWorkflow`; creation must have `status: proposed`. Installed Mercur creation defaults to proposed and uses its native product workflow. Use a unique QA title/SKU, existing categories/options and seller-owned images; promotion/publication and offer setup are separate steps requiring the normal authorized flow.
- **SDK:** `scopedClient` wraps the existing Medusa SDK's `client.fetch`, uses plain object bodies, and adds `x-seller-id` from authorized membership. It does not use raw fetch or embed credentials. Order operations use this wrapper. Keep generated/published request types and the installed validators as the contract.
- **Order:** use the established Store cart/checkout flow, including offer-backed lines, region, address, shipping, native payment-session initiation, test confirmation, then `/store/carts/:id/complete`. Mercur uses `completeCartWithSplitOrdersWorkflow` and preserves seller/order-group/payment/inventory links. The application hook composes seller readiness and product pause checks; it covers Store completion and payment-driven completion. A handcrafted order or direct generic order creation does not prove this marketplace flow.
- **Scripts:** `packages/api/src/scripts/configure-storefront-region.ts` has `dry-run` (default) and `apply`; it reports proposed USD/US region and Stripe attachment changes before returning in dry-run. Existing `backfill-vendor-warehouse.ts`, `recover-vendor-application.ts`, and `reindex-search.ts` are operational tools, not disposable order seeders. No dedicated safe QA product/order creation script was found in `src/scripts`.
- **CLI invocation pattern:** from the repository root, `pnpm --filter @usapeek/api exec medusa exec ./src/scripts/configure-storefront-region.ts dry-run`. This is a documented available command, **not executed**. Even a dry-run script boots Medusa and resolves services, so it should not be used as a strict no-side-effect configuration inspector against this remote/shared runtime. `apply`, recovery, reindex, migration, and server commands were not run.

## Focused verification available

No test/build commands were executed for this documentation-only audit. No claim of runtime or end-to-end success is made. The following existing checks can be selected by the coordinator after confirming their isolation:

| Tests | Coverage visible in source |
| --- | --- |
| `src/lib/__tests__/stripe-connect-configuration.unit.spec.ts` | Reject live keys, incomplete configuration, safe return origins, job opt-in. |
| `src/lib/__tests__/stripe-connect-guards.unit.spec.ts`, `stripe-connect-provider.unit.spec.ts`, `stripe-account-webhook.unit.spec.ts` | Payment/account boundary behavior and provider/webhook fixtures. |
| `src/modules/resend/__tests__/resend.unit.spec.ts`, `src/lib/__tests__/deliver-email-notification.unit.spec.ts`, `auth-email.unit.spec.ts` | Provider/configuration and delivery/idempotency/auth-email behavior. |
| `src/workflows/__tests__/shipment-notification.unit.spec.ts` | Native subscriber wiring, actual fulfillment owner, suppression/skip conditions, retry keys, failure propagation, safe URLs, escaped partial-shipment content; delivery is mocked. |
| `src/workflows/__tests__/product-sale-composition.unit.spec.ts` | Loads native Mercur cart hooks alongside application sale/offer validation in a child process. |
| `src/workflows/__tests__/cart-completion-retry.unit.spec.ts`, `order-group-cart-scope.unit.spec.ts`, `cart-offer-quantity.unit.spec.ts` | Completion retry/locking, correct group/cart association, and offer quantity behavior. |
| `src/lib/__tests__/vendor-warehouse-read.unit.spec.ts`, `vendor-order-stages.unit.spec.ts` | Warehouse/order access and native seller-filter composition, stages, batching and failure cases. |
| `src/workflows/__tests__/vendor-shipping-composition.unit.spec.ts` | Shipping composition against native hooks. |

For example, the package's existing runner supports `pnpm --filter @usapeek/api test:unit --runTestsByPath src/lib/__tests__/stripe-connect-configuration.unit.spec.ts src/workflows/__tests__/shipment-notification.unit.spec.ts`. Inspect mocks before broadening to other files. HTTP/module integration suites boot infrastructure and are not read-only audits; do not point them at the configured shared dataset. Required lint/typecheck/build completion gates apply to code changes, which this worker did not make.

Still unverified: active process configuration/code, remote dataset ownership, actual region/provider registration, seller readiness and stock, matching Stripe account and webhook delivery, actual payment authorization/capture, controlled Resend receipt, carrier side effects, and authenticated browser transitions. These are coordinator-owned QA actions, not completed findings.

## Primary local source map

- `packages/api/medusa-config.ts`; `src/lib/stripe-connect-configuration.ts`; `src/lib/stripe-connect/sale-readiness.ts`.
- `packages/api/src/modules/resend/{configuration,service}.ts`; `src/lib/{auth-email,deliver-email-notification}.ts`; `src/subscribers/order-shipped.ts`; `src/workflows/shipment-notification.ts`.
- `packages/api/src/api/vendor/catalog/middlewares.ts`; `src/lib/catalog/product-validation.ts`; `src/lib/vendor-warehouse/native-guards.ts`; `src/workflows/hooks/stripe-sale-readiness.ts`.
- `node_modules/@mercurjs/core/.medusa/server/src/api/vendor/orders/{validators,middlewares}.js` and `[id]` action routes; `workflows/order/workflows/create-order-fulfillment.js`; `workflows/cart/workflows/complete-cart-with-split-orders.js`; `workflows/payment/workflows/process-payment.js`.
- Installed `@medusajs/core-flows` 2.18.0 `dist/order/workflows/{create-shipment,complete-orders}.js`, `dist/fulfillment/workflows/create-shipment.js`, `dist/order/steps/complete-orders.js`; installed `@medusajs/order` 2.18.0 `dist/services/order-module-service.js` (`completeOrder_`).
- `node_modules/@mercurjs/docs/content/user-guide/vendor/orders/how-tos/{fulfill-an-order,ship-an-order,mark-an-order-as-delivered}.mdx`; `content/references/api/vendor/orders/complete-order.mdx`; `content/platform/order-group/concepts/order-splitting.mdx`.
