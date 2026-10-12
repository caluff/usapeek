# Operational scripts

Scripts execute inside Medusa's container; startup loads configured modules.
Inspect each script's guards and target environment before execution. Keep
credentials in the ignored root environment.

| Script                                                                  | Purpose / side effects                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `configure-storefront-region.ts`                                        | US/USD region and Stripe configuration. Defaults to `dry-run`; `apply` mutates through workflows.     |
| `backfill-vendor-warehouse.ts`                                          | Seller warehouse; defaults to `dry-run`, supports explicit `apply`.                                   |
| `recover-vendor-application.ts`                                         | Inspects the original operation by default. `cancel`/`finalize` mutate and require its recovery gate. |
| `reindex-search.ts`                                                     | Writes Algolia settings/projections and removes obsolete records; package command `search:reindex`.   |
| `inspect-order-finance.ts`                                              | Reads a finance view without provider secrets/customer details; requires an operator.                 |
| `settle-order-finance.ts`                                               | Inspects a settlement plan by default; operator, stable UUID and reason required; `--execute` transfers. |
| `recover-order-finance.ts`                                              | Inspects an operation; execution requires `--execute` and the inspected `--plan-hash`, with stopped-writer evidence when applicable. |
| `refresh-order-finance-provider-facts.ts`                               | Inspects stored facts by default; `--execute` reads the TEST provider and persists a new reconciled observation. |
| `inspect-order-finance-extension-qa.ts`, `verify-order-finance-qa.ts`   | Inspects/checks existing financial QA fixtures; inspect each guard before use.                        |
| `seed-order-finance-qa.ts`, `seed-order-finance-extension-qa.ts`        | Creates/mutates dedicated QA fixtures; not ordinary setup.                                            |
| `reconcile-finance-extension-qa.ts`, `repair-finance-qa-payout-link.ts` | Fixture-specific repairs, not general recovery tools.                                                 |

Use the existing pnpm/Medusa tooling in [package.json](../../package.json) with
the script's declared arguments. Finance currently uses TEST Stripe and USD;
keep general commerce jobs disabled. Automatic settlement has a separate opt-in
and configurable-delay contract documented under [jobs](../jobs/README.md); its
default remains 3 days and existing clocks retain their original deadline.
The full new-order elapsed-time check is still
pending. Never copy fixture assumptions to arbitrary orders.

General settlement and recovery completed F07/F08 in the TEST/USD/manual closure;
the original audit preserves its historical findings. LIVE and bank payouts are
not certified. QA scripts and historical reports do not certify a new automatic
settlement run. Record new
verification in [development progress](../../../../docs/develpment/development-progress.md).
