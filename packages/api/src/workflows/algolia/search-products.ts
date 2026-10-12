import type { HttpTypes, MedusaContainer } from "@medusajs/framework/types";
import { prepareRetrieveQuery } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { defaultStoreProductFields } from "@mercurjs/core/api/store/products/query-config";
import { resolveVisibleSellerIds } from "@mercurjs/core/api/utils/sellers";
import type { SearchParamsObject } from "algoliasearch";
import type { StoreSearchProductsQuery } from "../../api/store/products/search/validators";
import type {
  SearchFacet,
  StoreSearchProductsResponse,
} from "../../api/store/products/search/contracts";
import { ALGOLIA_MODULE } from "../../modules/algolia";
import type AlgoliaModuleService from "../../modules/algolia/service";
import { SHARED_CATALOG_SCOPE } from "../../modules/algolia/types";
import { searchRegion } from "./product-projection";

type SearchInput = StoreSearchProductsQuery & { sales_channel_ids: string[] };

export function buildSearchParams(
  input: SearchInput,
  visibleSellerIds: string[],
  sellerFacets = false,
): SearchParamsObject {
  const visible = new Set(visibleSellerIds);
  const sellers =
    input.seller_ids.length && !sellerFacets
      ? input.seller_ids.filter((id) => visible.has(id))
      : visibleSellerIds;
  return {
    query: input.query,
    page: input.page,
    hitsPerPage: input.hitsPerPage,
    attributesToRetrieve: ["id"],
    attributesToHighlight: [],
    facetFilters: [
      `region_id:${input.region_id}`,
      ...(input.seller_ids.length || sellerFacets
        ? [sellers.map((id) => `seller_scope:${id}`)]
        : ["seller_scope:all"]),
      ...(input.seller_ids.length > 1 && !sellerFacets
        ? sellers.map((id) => `lower_price_seller_ids:-${id}`)
        : []),
      [...input.sales_channel_ids, SHARED_CATALOG_SCOPE].map(
        (id) => `sales_channel_ids:${id}`,
      ),
      sellers.map((id) => `seller_ids:${id}`),
      ...(input.category_ids.length
        ? [input.category_ids.map((id) => `category_ids:${id}`)]
        : []),
    ],
    numericFilters: [
      ...(input.min_price !== undefined ? [`price>=${input.min_price}`] : []),
      ...(input.max_price !== undefined ? [`price<=${input.max_price}`] : []),
    ],
    facets: ["category_ids", "seller_ids", "price"],
    maxValuesPerFacet: 100,
  };
}

const emptyResult = (input: SearchInput): StoreSearchProductsResponse => ({
  products: [],
  nbHits: 0,
  page: input.page,
  nbPages: 0,
  hitsPerPage: input.hitsPerPage,
  facets: { categories: [], sellers: [] },
  price_range: null,
  query: input.query,
});

export async function searchProducts(
  input: SearchInput,
  container: MedusaContainer,
): Promise<StoreSearchProductsResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [region, visibleSellerIds, { remoteQueryConfig }] = await Promise.all([
    searchRegion(container),
    resolveVisibleSellerIds(container),
    prepareRetrieveQuery({}, { defaults: defaultStoreProductFields }),
  ]);
  if (input.region_id !== region.id)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Search region must match the storefront's United States region.",
    );
  if (
    !input.sales_channel_ids.length ||
    !visibleSellerIds.length ||
    (input.seller_ids.length &&
      !input.seller_ids.some((id) => visibleSellerIds.includes(id)))
  ) {
    return emptyResult(input);
  }
  const algolia = container.resolve<AlgoliaModuleService>(ALGOLIA_MODULE);
  const searchParams = buildSearchParams(input, visibleSellerIds);
  const resultsPromise = algolia.search(searchParams, input.sort);
  // Price bounds must remain expandable, including when the selected interval
  // has no hits. Keep every visibility/facet constraint except the price itself.
  const priceRangePromise =
    input.min_price !== undefined || input.max_price !== undefined
      ? algolia.search(
          {
            ...searchParams,
            numericFilters: [],
            facets: ["price"],
            page: 0,
            hitsPerPage: 0,
          },
          input.sort,
        )
      : resultsPromise;
  // Each seller record contains one product and its own minimum price, so
  // counting all visible scopes keeps unselected stores available to add.
  const sellerFacetsPromise =
    input.seller_ids.length || searchParams.numericFilters?.length
      ? algolia.search(
          {
            ...buildSearchParams(input, visibleSellerIds, true),
            facets: ["seller_ids"],
            page: 0,
            hitsPerPage: 0,
          },
          input.sort,
        )
      : resultsPromise;
  const [results, priceRangeResults, sellerFacetResults] = await Promise.all([
    resultsPromise,
    priceRangePromise,
    sellerFacetsPromise,
  ]);
  const productIds = results.hits.map((hit) => hit.id);
  const categoryCounts = results.facets?.category_ids ?? {};
  const sellerCounts = sellerFacetResults.facets?.seller_ids ?? {};
  const [productResult, categoryResult, sellerResult, offerResult] =
    await Promise.all([
      query.graph({
        entity: "product",
        fields: [
          ...remoteQueryConfig.fields,
          "images.variants.id",
          "sales_channels.id",
        ],
        filters: { id: productIds, status: "published" },
      }),
      query.graph({
        entity: "product_category",
        fields: ["id", "name"],
        filters: {
          id: Object.keys(categoryCounts),
          is_active: true,
          is_internal: false,
        },
      }),
      query.graph({
        entity: "seller",
        fields: ["id", "name"],
        filters: {
          id: Object.keys(sellerCounts).filter((id) =>
            visibleSellerIds.includes(id),
          ),
        },
      }),
      query.graph({
        entity: "offer",
        fields: ["product_id"],
        filters: {
          product_id: productIds,
          seller_id: input.seller_ids.length
            ? input.seller_ids.filter((id) => visibleSellerIds.includes(id))
            : visibleSellerIds,
        },
      }),
    ]);
  // Recheck visibility after searching: an asynchronously indexed document is
  // never permission to return an unpublished product or another sales channel.
  const offeredIds = new Set(offerResult.data.map((offer) => offer.product_id));
  const channels = new Set(input.sales_channel_ids);
  const publicProducts = productResult.data.filter(
    (product) =>
      offeredIds.has(product.id) &&
      (!product.sales_channels?.length ||
        product.sales_channels.some(
          (channel) => channel && channels.has(channel.id),
        )),
  );
  const productMap = new Map(
    publicProducts.map((product) => [product.id, product]),
  );
  const ordered = productIds.flatMap((id) => {
    const product = productMap.get(id);
    if (!product) return [];
    const { sales_channels: _channels, ...publicProduct } = product;
    return [publicProduct];
  });
  // The graph returns native DTO Date values; HTTP transport uses ISO strings.
  const products: HttpTypes.StoreProduct[] = JSON.parse(
    JSON.stringify(ordered),
  );
  const facet = (
    items: Array<{ id: string; name: string }>,
    counts: Record<string, number>,
  ): SearchFacet[] =>
    items.map((item) => ({
      id: item.id,
      label: item.name,
      count: counts[item.id] ?? 0,
    }));
  const priceStats = priceRangeResults.facets_stats?.price;
  const response: StoreSearchProductsResponse = {
    products,
    nbHits: results.nbHits ?? 0,
    page: results.page ?? input.page,
    nbPages: results.nbPages ?? 0,
    hitsPerPage: results.hitsPerPage ?? input.hitsPerPage,
    facets: {
      categories: facet(categoryResult.data, categoryCounts),
      sellers: facet(sellerResult.data, sellerCounts),
    },
    price_range:
      priceStats?.min !== undefined && priceStats?.max !== undefined
        ? { min: priceStats.min, max: priceStats.max }
        : null,
    query: input.query,
  };
  return response;
}

export const searchAlgoliaProductsStep = createStep(
  "search-algolia-products",
  async (input: SearchInput, { container }) =>
    new StepResponse(await searchProducts(input, container)),
);

export const searchAlgoliaProductsWorkflow = createWorkflow(
  "search-algolia-products",
  function (input: SearchInput) {
    return new WorkflowResponse(searchAlgoliaProductsStep(input));
  },
);
