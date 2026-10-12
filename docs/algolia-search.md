# Storefront product search

The storefront uses the Medusa Store API to search Algolia. It does not expose an Algolia key to the browser. The integration adapts the official Mercur Algolia registry block to Mercur 2.3.3's offer-based pricing model; it does not install a second commerce engine.

This guide describes the current source and expected configuration; it does not certify the current remote index or a fresh integration run. Development closure is tracked in [Development Progress](develpment/development-progress.md). Search pagination already exists; F10 concerns the separate catalog/category view, not this search endpoint.

## Configuration

Set these variables in the ignored root `.env` locally, and in both the API and worker environment when deploying:

```dotenv
ALGOLIA_APP_ID=<application-id>
ALGOLIA_API_KEY=<private restricted indexing key>
ALGOLIA_PRODUCT_INDEX=usapeek_dev_products
```

Use a key restricted to the configured index and its replicas (for the example, `usapeek_dev_products*`), with the permissions `search`, `browse`, `addObject`, `deleteObject`, `settings`, and `editSettings`. These are required configuration expectations, not a fresh inspection of the remote key. Never put the key in `NEXT_PUBLIC_*`, `apps/web/.env.local`, a commit, or a browser bundle. Production must use a separate index prefix and restricted key.

This is an example for a new index. The existing local index retains its stored name and restricted key during the [usapeek rename](operations/usapeek-rename-2026-10-05.md); changing the brand does not provision a replacement index.

Without `ALGOLIA_API_KEY`, the module is not registered and `POST /store/products/search` returns 503; the remaining storefront can still run. With a key, startup requires an application ID and an index name containing only letters, numbers, hyphens or underscores. Missing search configuration is not treated as an empty result set.

The API and worker also require a working `REDIS_URL`. Updating the root environment requires restarting the running processes. Switching Redis does not migrate queued events from the previous instance; the full reindex below rebuilds the search projection from PostgreSQL through Medusa, not from old queue data.

## Initial indexing and recovery

The following command writes to Algolia and may remove obsolete records in the configured index. Confirm that the environment points to the intended development index before running it; it is not a read-only verification command.

```powershell
pnpm --filter @usapeek/api search:reindex
```

This native Medusa workflow configures the primary index and three standard replicas (`_price_asc`, `_price_desc`, `_newest`), indexes eligible products, and removes obsolete records from this index. It does not delete other indexes or modify products, prices, orders, or inventory. No manual product upload or Algolia onboarding wizard is required.

Replicas and seller-specific records increase the indexed record count; monitor Algolia usage before increasing the catalog substantially. Redis is used by the native workflow/event/locking modules and must have available quota.

The index is updated by product, offer, pricing, seller, category, region, and sales-channel events. A native scheduled job reconciles every 15 minutes to cover scheduled price changes and recover drift. Synchronization is asynchronous: prices and facet counts in the index can briefly lag commerce data. Product cards retrieve current public offer prices from Mercur, and purchase validation remains native.

## Search behavior

- The persistent root navbar contains the same search input on all storefront pages.
- Enter/search submits to `/search?q=...`; suggestions start after two characters and a 300 ms pause. Superseded requests are cancelled.
- URL state uses repeated `category_id` and `seller_id` (up to twenty stores), `min_price`, `max_price`, `sort`, and one-based `page`.
- Desktop has a filter sidebar; mobile uses an accessible dialog. Apply commits filters together; clear preserves the search term and sorting.
- Sorting: relevance, ascending/descending price, newest. Pagination is global in Algolia, not applied to a downloaded page.
- Search currently targets the same United States/USD public pricing context as the storefront. It does not index customer-specific pricing.
- Store checkboxes select any of the checked stores; no selection searches all stores. Price filtering and sorting use the lowest public offer price among the selected stores. Each seller record indexes `lower_price_seller_ids`, ordered by price and then seller ID to resolve ties. Excluding selected predecessors leaves one minimum-price record per product before filtering, counting, sorting, and pagination. A cheaper unselected store cannot affect the result.
- Store facet counts are disjunctive: they retain other visible stores with matching products and their own minimum prices, so more stores can be added after applying a selection.
- Run the full reindex command when introducing `lower_price_seller_ids`, before serving the updated search queries. This configures its filter attribute on the primary index and replicas and populates every seller record; old records without the field cannot guarantee unique results across multiple stores. Subsequent offer/price synchronization recalculates every seller scope for the affected product.
- Search results are rechecked against current product publication, seller visibility, and the publishable key's sales channels before being returned. The index is not an authorization source.
- Search errors are not presented as an empty catalog. The navbar and page shell remain usable while dependent regions load.

## Contracts and validation

`POST /store/products/search` is called through the existing Medusa SDK. Its body is validated with Medusa's Zod, and generated declarations are exposed through the type-only `@usapeek/api/search-contracts` export.

```powershell
pnpm --filter @usapeek/api search:contracts:generate
pnpm --filter @usapeek/api search:contracts:check
pnpm lint:web
pnpm typecheck:web
pnpm build:web
pnpm lint:api
pnpm typecheck:api
pnpm build:api
pnpm peers check
```

Sources: [Mercur official blocks](https://docs.mercurjs.com/blocks), [Medusa Algolia integration](https://docs.medusajs.com/resources/integrations/guides/algolia), [Algolia API-key security](https://www.algolia.com/doc/guides/security/api-keys).

## Implementation map

- [Module configuration](../packages/api/src/modules/algolia/configuration.ts) and [service](../packages/api/src/modules/algolia/service.ts).
- [Search route](../packages/api/src/api/store/products/search/route.ts), [validators](../packages/api/src/api/store/products/search/validators.ts), and [workflow](../packages/api/src/workflows/algolia/search-products.ts).
- [Product projection](../packages/api/src/workflows/algolia/product-projection.ts), [synchronization workflow](../packages/api/src/workflows/algolia/sync-products.ts), and [scheduled reconciliation](../packages/api/src/jobs/reconcile-search.ts).
- [Reindex script](../packages/api/src/scripts/reindex-search.ts). Contract generation and builds above write generated output; list them as executed only after actually running them.
