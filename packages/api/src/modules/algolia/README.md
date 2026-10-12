# Storefront search

Adapted from the [official Mercur Algolia block](https://github.com/mercurjs/mercur/blob/91d476b9adc82a6dc689fa794df8c75b56908742/packages/registry/r/algolia.json), checked against installed Mercur 2.3.3 documentation and Medusa 2.18.0 source. The block's product-variant price and single-seller assumptions are replaced by native Mercur offers. No database model, migration, workflow hook override, or browser Algolia key is added.

## Configuration

Set these only in the ignored root `.env` and the API/worker deployment environment:

```dotenv
ALGOLIA_APP_ID=<your application ID>
ALGOLIA_API_KEY=<restricted private key>
ALGOLIA_PRODUCT_INDEX=usapeek_dev_products
```

The index name above is an example for a new index. Existing indexes retain their stored identifiers during the brand rename. The key needs `search`, `addObject`, `deleteObject`, `settings`, `editSettings`, and `browse`, restricted to your configured index and its replicas. Use a separate key and index prefix in production. Never expose this key as `NEXT_PUBLIC_*`.

Without `ALGOLIA_API_KEY`, the module is not registered. Providing the key also requires an application ID and a valid index name. This optional registration does not make the search feature operational without configuration.

After Redis and PostgreSQL are available:

```sh
pnpm --filter @usapeek/api search:reindex
```

The native Medusa workflow configures the primary index and `_price_asc`, `_price_desc`, `_newest` standard replicas, then synchronizes products in batches and removes obsolete records. It does not delete an index. Re-running it is safe, including after a partial failure. Mutations are serialized by the existing Redis locking module. Standard replicas and seller-scope records increase the Algolia record count; check the application's usage before production rollout.

## Search contract

`POST /store/products/search` uses the storefront's publishable key and accepts only the generated `StoreSearchProductsInput` fields. The current storefront supports the United States region. It deliberately rejects arbitrary Algolia expressions, customer/group IDs, currency overrides, and client-supplied sales channels.

Every product has an aggregate seller scope and a scope per seller. Searches choose exactly one scope: all stores or one selected store. This makes the price filter/sort correlate with the displayed seller, and counts/pagination remain product-level without filtering a downloaded result page. Prices are native regional public offer prices for quantity one, in Medusa display units. They are projections for discovery, never checkout prices; product cards rehydrate offers through Mercur and checkout recalculates natively.

Publication status, current seller visibility, and the publishable key's sales channels are checked on reads. Product data uses native public Store API fields, never `seller.*` or raw price rules. Search indexes are eventually consistent: counts, facets and price ordering can briefly lag a mutation, while hydration excludes no-longer-visible products. Events synchronize product/offer/seller/category/region/channel/pricing changes, and the 15-minute reconciliation handles time-based price-list and seller-closure changes plus missed events.

Mercur's canonical catalog can have no product-level sales-channel assignments; its native Store products route exposes these shared products through offers. Such products use a reserved shared-catalog scope in the index. Explicitly channel-assigned products remain restricted to the publishable key's channels. No product-channel relationships are created by this integration.

Algolia's configured pagination window is 1,000 results. Narrow a search with filters to reach more specific products; the total count may exceed the accessible window.

The generated declaration at `.mercur/search-contracts.d.ts` is the frontend boundary:

```sh
pnpm --filter @usapeek/api search:contracts:generate
pnpm --filter @usapeek/api search:contracts:check
```
