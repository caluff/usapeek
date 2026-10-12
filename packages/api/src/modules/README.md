# Backend modules and providers

Registration lives in [medusa-config.ts](../../medusa-config.ts).
Native Mercur/Medusa modules remain the backend core.

| Local module/provider                                          | Responsibility                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `vendor-onboarding/`                                           | Applications, durable mutation journal, notification outbox and seller warehouse records. |
| `commerce-automation/`                                         | Scan, operation and group-state journals for finance/evaluation flows.                    |
| `catalog-media/`                                               | Tracked catalog image records and ownership.                                              |
| `catalog-permission/`                                          | Private per-store moderation authority, changed only by operators with seller.update. |
| `product-media-file/`                                          | Configured file-provider adapter for catalog uploads.                                     |
| [inventory](inventory/README.md)                               | Extends pinned native inventory service/repositories for concurrency.                     |
| [stripe-allocated-payment](stripe-allocated-payment/README.md) | Native Stripe wrapper for allocated-capture webhook handling.                             |
| [resend](resend/README.md)                                     | Auth, onboarding and shipment email notifications.                                        |
| [algolia](algolia/README.md)                                   | Search projections/query support based on native offers.                                  |

Modules own persistence. [Workflows](../workflows/README.md) orchestrate
cross-domain mutations, with [links](../links/README.md) and native Query for
relationships. Preserve native migration history when extending a module;
inventory's README explains its version-specific integration.

Stripe is TEST-only and finance is not development complete. The operation
journal is not yet a complete immutable financial ledger. See the
[audit](../../../../docs/develpment/development-completion-audit.md) and
[implementation plan](../../../../docs/develpment/development-implementation-plan.md).
