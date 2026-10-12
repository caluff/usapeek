# Marketplace workflows

This directory orchestrates local mutations around native Medusa/Mercur flows.

| Area                 | Entry points                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding           | `mutate-vendor-application.ts`, `recover-vendor-application.ts`, `vendor-application-notifications.ts`, `backfill-vendor-warehouse.ts`.           |
| Auth                 | `complete-google-auth.ts`, `vendor-session.ts`.                                                                                                   |
| Catalog/inventory    | `validate-vendor-catalog.ts`, `upload-catalog-images.ts`, `update-vendor-offer-price.ts`, `update-vendor-stock.ts`, `set-product-sale-status.ts`. |
| Catalog permissions | `set-seller-catalog-permission.ts`, `catalog-permission-create-product.ts`, `catalog-permission-edit-product.ts`; native moderation with private per-store authority. |
| Checkout/finance     | `validate-cart-sale-status.ts`, `guard-order-finance-writer.ts`, `operate-order-finance.ts`, `order-finance-native.ts`.                           |
| Settlement/recovery  | `settle-order-finance.ts`, `settlement-native.ts`, `recover-order-finance.ts`, `recover-finance-execution-lock.ts`, `refresh-order-finance-provider-facts.ts`. |
| Automatic settlement | `record-order-completions.ts`, `automatically-settle-orders.ts`; server-observed immutable clock with a frozen 0–365-day delay and the guarded settlement executor.              |
| Shipping/Connect     | `configure-vendor-shipping.ts`, `shipment-notification.ts`, `refresh-vendor-stripe-account.ts`, `reconcile-stripe-account.ts`.                    |
| Search/favorites     | `algolia/`, `update-customer-favorite.ts`.                                                                                                        |
| Scheduled evaluation | `evaluate-commerce.ts`; separate general-commerce path remains gated and disabled.                                                                |

Focused operations live in `steps/`. `hooks/` composes native offer-validation
and Stripe sale-readiness hooks. Review installed and local registrations before
adding handlers; retain composition/load regression tests.

Keep composition synchronous and use workflow primitives for branching/transforms.
Business validation, authorization and compensation belong in workflows; modules
own persistence. Reuse native inventory, pricing, payment and order operations.

The journal and original snapshots support immutable TEST/USD financial history,
settlement and general recovery. F01–F12 / Phase 1–6 are closed for manual
operations. Automatic settlement has a separate opt-in and reuses those controls;
its full new-order run after 72 real hours still needs verification. Keep general
commerce jobs disabled and follow the [job contract](../jobs/README.md) and
[current progress](../../../../docs/develpment/development-progress.md).
