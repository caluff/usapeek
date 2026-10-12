# Vendor dashboard

Independent Next.js seller application connected to the Mercur Vendor API.
Member authentication uses isolated HTTP-only cookies, explicit seller context
and fresh membership/status checks. Backend ownership and authorization remain
authoritative for every operation.

## Connected surfaces

| Route                         | Current behavior                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/seller`                     | Operational counts, preparation checks and scoped financial reporting: net sales, earnings, net transfers and pending settlement, with sale detail and period filters. |
| `/seller/catalog`             | Searchable, paginated shared catalog; proposed products, staged content/image edits, variants and seller offers/prices. Product approval and a sellable offer remain distinct.        |
| `/seller/catalog/[id]/stock`  | Inventory associated with the product and the seller's approved warehouse.                                                                                                            |
| `/seller/inventory`           | Scoped inventory with absolute stock adjustments, stale-count/reservation checks and backend concurrency protection.                                                                  |
| `/seller/inventory/locations` | Read/recheck the single US warehouse based on the approved application address. Free creation of warehouses is not part of the current flow.                                          |
| `/seller/orders`              | Assigned orders, details, partial preparation, shipping/tracking and supported fulfillment transitions; cancellation/refund controls in Stripe TEST, governed by backend eligibility. |
| `/seller/settings`            | Profile, business address and corporate name. Tax identifiers are not collected by these profile controls.                                                                            |
| `/seller/settings/shipping`   | Supported US shipping setup and editable marketplace shipping options/prices.                                                                                                         |
| `/seller/settings/payments`   | Stripe Connect TEST onboarding/re-entry, account state and refresh. An enabled account is not evidence of a transfer or bank payout.                                                  |
| `/seller/status`              | Restricted-state information for accounts outside the operational workspace.                                                                                                          |

Approved applicants retain buyer credentials but obtain a separate member
session. The generic public seller registration route remains closed. Shared
published products can be visible to multiple sellers; their offers, inventory
and assigned orders remain seller-scoped.

New master products are proposed for review; staged edits do not immediately
replace published content. Existing drafts require operator progression when the
native vendor schema does not support the required status change. A product is
buyable only after the backend's offer, stock, shipping, seller and payment-account
requirements are satisfied.

## Financial limits

Order details expose allocated, captured, refunded and refundable amounts plus
operation history, including returned commission when applicable. The financial
report on `/seller` provides the sale breakdown from backend snapshots and
reconciled movements, including original commission/earnings and transfers/reversals.
It remains scoped to the seller, with periods in `America/Montevideo` and explicit
partial coverage.

F01–F12 / Phase 1–6 are **DONE**, with **Financial Readiness: PASS for TEST/USD
and manual operations**, including general settlement and recovery. The separate
automatic job waits 72 elapsed hours from the server's first valid observation
of order completion and checks eligibility again before transferring the net
entitlement to the Stripe TEST Connect balance. It is active locally; full
verification with a new order and 72 real hours is still pending. Existing orders
without a completion clock require manual review. Transfer does not prove a bank
payout, and LIVE is unsupported. See [current progress](../../docs/develpment/development-progress.md).

## Development

Follow the [root README](../../README.md) for workspace installation and backend
configuration, then run:

```bash
pnpm --filter @usapeek/vendor dev
```

Open `http://localhost:7001/seller`. Configure
`NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_STOREFRONT_URL` as public origins.
The storefront origin supplies an ordinary `/account/sell` link, never credentials
or tokens. It defaults to `http://localhost:3000` outside production; production
requires an explicit HTTPS origin.

```bash
pnpm lint:vendor
pnpm typecheck:vendor
pnpm build:vendor
```

These are verification commands, not results for the current tree. Inventory
concurrency relies on the backend extension documented in the
[inventory contract](../../packages/api/src/modules/inventory/README.md).

## Documentation

- [Current vendor operations](../../docs/vendor-operations.md)
- [Development audit](../../docs/develpment/development-completion-audit.md)
- [Implementation phases](../../docs/develpment/development-implementation-plan.md)
- [Session handoff/progress](../../docs/develpment/development-progress.md)
- [Historical initial integration report](IMPLEMENTATION.md)
