# Automatic capture: isolated Stripe TEST verification

Date: 2026-10-06. Run: `d11f80eb46e243f7aeaf2b5c3bdd2f6e`.

## Environment and scope

- Fresh Docker PostgreSQL on localhost:55432 and TLS Redis on localhost:56379/15, with ephemeral credentials and verified TLS. Database and Redis data were held in temporary container filesystems.
- The installed Medusa 2.18/Mercur 2.3.3 application, native migrations, HTTP authentication, RBAC, checkout, fulfillment, financial workflows, PostgreSQL persistence and Redis subscribers were used.
- Stripe's actual TEST API was used with `pm_card_visa`; payment network calls were not mocked. No LIVE key or real card was used.
- All Stripe PaymentIntents carried this run's ownership metadata. Existing development databases, orders, customers, Stripe objects and Docker services were not changed.
- Seller warehouse approval and Connect account readiness were explicitly local fixtures. Connect onboarding, transfers, payouts and production behavior are outside this verification.

## Successful scenarios

Final execution: four HTTP integration tests passed, zero failed. Native subscriber queues were drained before restoring the disposable database between cases.

| Scenario | Stripe result | Native accounting |
| --- | --- | --- |
| Two stores; first store has two units | Authorization remains pending through the first store and partial quantities; the fulfillment subscriber captures USD 69.97 only after every active quantity is prepared | One payment and one capture; USD 44.98 + USD 24.99 assigned to the respective orders |
| Manual mode, then enable Automatic for a prepared purchase | Manual preparation and a Manual reconciliation sweep leave the authorization untouched; enabling Automatic and running the reconciliation workflow captures USD 49.98 | One capture; USD 24.99 per store |
| Cancel one store before preparation | One final partial capture of USD 24.99 from the original USD 49.98 authorization; no amount remains capturable | Active store USD 24.99, canceled store USD 0 |
| Explicit operator capture in Manual mode | Preparation leaves the authorization pending; the authenticated operator action captures USD 49.98 | One capture; USD 24.99 per store |

The first scenario also verified stale-setting conflicts, rejection of a customer's attempt to change the payment setting, duplicate automatic workflow calls, another reconciliation sweep, and two signed replays of the actual Stripe success event through the local HTTP webhook handler. Stripe and the native capture ledger remained unchanged after these repetitions. The event payload came from Stripe; delivery to the isolated API was local rather than an externally configured Stripe webhook endpoint. The periodic scheduler itself was not timed; its reconciliation workflow was executed directly.

Regression source: `packages/api/integration-tests/http/automatic-capture-stripe.spec.ts`. It requires explicit opt-in, the repository's disposable database/Redis guards, a private TEST key file, and a cleanup ledger. The launcher must release/refund this run's owned payments and delete its temporary infrastructure even if a test fails.

## Completion checks

- API unit tests: 56 passed across seven suites.
- API lint: no errors; existing warnings remain.
- API build: passed.
- API typecheck: blocked by six errors in the unrelated, concurrently added `integration-tests/http/order-tracking.spec.ts` (unsupported `is_draft_order`, generic call on an untyped value, two ES2021 `String.at` errors, and two nullable-item errors). The automatic-capture test introduced no reported type errors. That other task's file was preserved.

## Cleanup

All ten TEST PaymentIntents created during the successful and preliminary executions were identified by ownership metadata. Seven captured TEST payments were fully refunded and three remaining authorizations were canceled. All ten associated temporary Stripe TEST customers were deleted after verifying their fictional fixture email, creation time, TEST mode and exclusive ownership of their payments.

Stripe retains TEST transaction history for captured/refunded or canceled PaymentIntents. It was not represented as deletable transaction history, and no shared account-wide reset was performed.

Local environment deletion: verified. Both owned containers (including their temporary data), the owned network, TLS certificates, private credentials, temporary launcher and private diagnostics were deleted. Docker reported no remaining container or network with this run's ownership label. The existing development PostgreSQL:5432 and Redis:6379 remained running and healthy.
