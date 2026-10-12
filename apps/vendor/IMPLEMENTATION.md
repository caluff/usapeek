# Operational vendor dashboard

> Historical evidence from the initial Vendor API integration (last recorded
> change: 2026-09-05). The body below preserves the delivered scope and checks at
> that time. Its free location creation, deferred offers/shipping/finance and
> missing backend concurrency protection are superseded by later work. See the
> [current vendor README](README.md), [vendor operations](../../docs/vendor-operations.md)
> and [development audit](../../docs/develpment/development-completion-audit.md).
> Historical test results are not verification of the current tree.

The vendor app now uses its existing Medusa SDK with explicit `x-seller-id` and uncached requests. All seven workspace mutations independently reload membership and require an active member plus seller status `open`; native API authorization remains authoritative. The API owner separately implemented the backend live-access, catalog-visibility, and location-ownership guards.

## Capabilities

| Surface | Implemented behavior |
| --- | --- |
| `/seller` | Real catalog-visible, assigned-order, and inventory-item counts; recent orders; backend `/vendor/onboarding` setup checks with complete/incomplete/blocked distinctions and reasons |
| `/seller/catalog` | Searchable, paginated native catalog; explicitly includes shared published products |
| `/seller/catalog/new` | Create a proposed master product and send it to review; no draft creation or sellable-offer claim |
| `/seller/catalog/[id]` | Current content and variants, seller-created change history, staged title/subtitle/description edits returning native `product_change` (202); existing draft progression marked as an operator prerequisite |
| `/seller/inventory` | Seller inventory, every paginated location level, verified location names, absolute stock adjustments with fresh level/location validation, stale-count rejection, nonnegative safe integers, and reserved-quantity checks |
| `/seller/inventory/locations` | Paginated seller locations and creation of a US stock location; does not configure fulfillment or shipping |
| `/seller/orders`, `/seller/orders/[id]` | Searchable paginated orders and read-only details, line items, amounts in display units, actual fulfillment records and delivery address |
| `/seller/settings` | Native seller profile, US business address and corporate-name saves; tax/registration identifiers are neither collected nor modified |
| `/seller/status` | Pending, suspended and terminated state views outside the workspace; active accounts return to workspace without status/login redirect loops |

## Authentication corrections

- Native `/vendor/sellers` defaults omit `member.*` and `role_id`; explicit field selection and complete pagination prevent valid memberships from being filtered out accidentally.
- Server rendering now retrieves `/vendor/members/me` without repeatedly posting a seller selection.
- Mercur excludes terminated sellers from `/vendor/sellers`. An existing selected seller is checked through the authenticated `/vendor/members/me` read and gets its exact terminated state; a new session without a selected seller uses the honest no-access explanation. The API owner confirmed the read bypasses seller-open/application-approved gates while retaining live identity, active member and membership validation.
- Login/no-access link to the configured `NEXT_PUBLIC_STOREFRONT_URL` origin plus `/account/sell`. The URL rejects credentials, query strings, fragments and unsafe schemes; production requires HTTPS and has no local fallback. Buyer credentials remain the login credentials after approval.

## Native contract evidence

Consulted installed Mercur 2.3.3 documentation under `node_modules/@mercurjs/docs/content/references/api/vendor`, plus installed route implementations, validators, query configuration, and `product-change-link` under `packages/api/node_modules/@mercurjs/core/.medusa/server/src`. DTOs come from published `@mercurjs/types`; expanded order fulfillments compose two published Mercur response contracts. Setup checks use the API owner's generated workspace contract package. Next.js Server Action authorization/error-handling patterns were verified through Context7.

Product reads and edits preflight visibility through the filtered native list. Product updates return a pending change, not a directly modified product. Inventory updates validate seller item ownership natively and additionally verify scoped stock-location access before writing.

## Limits and remaining integration verification

Offers/prices, variant setup, shipping, payments, payouts, commissions, fulfillment mutations, cancellations and refunds are deferred. Master product approval alone does not make a sellable offer. Native vendor product edits do not accept `status`, so existing drafts require operator progression.

The native stock write is absolute and has no compare-and-swap contract. The client rejects stale displayed counts before writing, but a concurrent write between read and update still requires backend concurrency protection.

No backend records, fixtures, commits, services or browser sessions were created by this worker. Live API and browser verification belong to the coordinator, including role-specific denial behavior and approved/suspended/terminated transitions.

## Verification

- Vendor lint: passed.
- Vendor typecheck: passed.
- Vendor tests: 26 passed, including 19 new behavioral tests for authorization, current-seller scoping, moderation, stock guards, US-only address/location scope, safe links and display-unit money.
- Vendor production build: passed; all added dynamic routes compiled.
- Package test script was updated by the manifest-owning API worker; no dependency was added by this worker.
