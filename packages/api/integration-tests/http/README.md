# HTTP integration tests

Suites use installed `@medusajs/test-utils` 2.21.2 and real Medusa wiring.
Unit tests and their runners were removed at the user's request. There is no
general `pnpm test` or `pnpm test:api` command. The HTTP and module integration
suites below remain available through their explicit runners.

Module and HTTP integration tests are explicit checks for the affected
persistence, API, authorization or workflow behavior. They require isolated
infrastructure and the opt-ins documented in each selected suite. Expand to
other domains only when a cross-cutting change affects them. Select HTTP files in separate processes when
several are needed, to avoid accumulating the application boot's memory.

| Suite                                | Coverage / opt-in                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database-hardening.spec.ts`         | API boot and `/health`, native customer CRUD after migrations, and SQL role restrictions; `DATABASE_ACCESS_TESTS=disposable-local`. The redundant standalone health scaffold was removed.                                                                                          |
| `vendor-order-completion.spec.ts`    | Native vendor ownership, delivery-gated completion, partial shipments, automatic completion on the last delivery, retries, pickup exceptions and selected preparation groups; `VENDOR_COMPLETION_TESTS=disposable-local`. No external providers.                                   |
| `catalog-permission.spec.ts`         | Per-store moderation authority, native publication, revocation, image ownership and shared catalog concurrency; `CATALOG_PERMISSION_TESTS=disposable-local`.                                                                                                                       |
| `google-auth.spec.ts`                | Google completion/account association with local fixtures; `GOOGLE_AUTH_TESTS=disposable-local`. No Google network calls.                                                                                                                                                          |
| `account-email-verification.spec.ts` | Panel account verification, native token confirmation, code ownership and safe requests; `ACCOUNT_EMAIL_VERIFICATION_TESTS=disposable-local`. Notification events are captured without delivering email.                                                                           |
| `vendor-onboarding.spec.ts`          | Lifecycle, authorization and native onboarding; `VENDOR_ONBOARDING_TESTS=disposable-local`.                                                                                                                                                                                        |
| `search-product-images.spec.ts`      | Native product gallery hydration with no thumbnail, empty galleries and exclusion of draft search hits; `SEARCH_IMAGE_TESTS=disposable-local`. Search/discovery fixtures make no Algolia calls.                                                                                    |
| `payment-release-settings.spec.ts`   | Saved release mode and 0–365-day delay, legacy/default3, validation/noop, native auth/RBAC, concurrent revisions, metadata protection and owner-only Redis lock without expiry; `PAYMENT_RELEASE_SETTINGS_TESTS=disposable-local`. No orders, Stripe calls or financial execution. |

Read the selected file header first. Before any suite loads, the global setup
requires `NODE_ENV=test`, PostgreSQL at `DB_HOST=localhost`, `DB_PORT=55432`,
`DB_USERNAME=closure_test`, an explicit `DB_PASSWORD`, and a `DATABASE_URL`
matching those credentials and that local destination. TLS requires
`PGSSLMODE=require`, an existing `NODE_EXTRA_CA_CERTS` file, and no disabled
certificate verification. Redis must use `rediss://closure:<password>@localhost:56379/15`
without URL query or fragment overrides. `DB_TEMP_NAME`/`MEDUSA_DB_SCHEMA` are
rejected; an optional `DB_WAITINGROOM_DATABASE` must be `postgres`.

External provider credentials must be explicitly blank; setup preserves that
opt-out against root dotenv loading and disables outbound email and financial
jobs. Suites require test-only signing secrets and their own documented opt-ins.
Ordinary development configuration is rejected before metadata initialization
or application startup. This also applies to module tests.

**The runner creates and drops disposable databases.** Do not use shared
Supabase/PostgreSQL or a normal development database. Set isolated configuration
before starting the process; no real actor credentials are needed.

After configuring that environment, select the intended suite:

```sh
pnpm --filter @usapeek/api test:integration:http --runTestsByPath integration-tests/http/google-auth.spec.ts
pnpm --filter @usapeek/api test:integration:http --runTestsByPath integration-tests/http/vendor-onboarding.spec.ts
```

A skipped suite is not successful verification. Existing suites do not cover
the full checkout/commission/transfer/refund circuit. F12 in the
[audit](../../../../docs/develpment/development-completion-audit.md) and Phase 6
of the [plan](../../../../docs/develpment/development-implementation-plan.md)
define that work. Historical results apply to their recorded date only; record
new commands/results in [progress](../../../../docs/develpment/development-progress.md).
