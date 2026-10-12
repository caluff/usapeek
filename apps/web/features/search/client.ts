import type {
  StoreSearchProductsInput,
  StoreSearchProductsResponse,
} from "@usapeek/api/search-contracts";

import { createCatalogSdk } from "@/lib/catalog-sdk";
import { validateStorefrontEnvironment } from "@/lib/storefront-config";
import { SEARCH_PAGE_SIZE, type SearchParameters } from "./parameters";

function searchSdk(signal: AbortSignal) {
  const configuration = validateStorefrontEnvironment({
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  });
  if (configuration.status !== "valid")
    throw new Error("Search configuration unavailable");
  return createCatalogSdk(configuration.config, signal);
}

export async function requestProductSearch(
  parameters: SearchParameters,
  regionId: string,
  signal: AbortSignal,
  pageSize = SEARCH_PAGE_SIZE,
) {
  const body: StoreSearchProductsInput = {
    query: parameters.q,
    page: parameters.page - 1,
    hitsPerPage: pageSize,
    category_ids: parameters.categoryIds,
    seller_ids: parameters.sellerIds,
    min_price: parameters.minPrice,
    max_price: parameters.maxPrice,
    sort: parameters.sort,
    region_id: regionId,
    country_code: "us",
  };
  return searchSdk(signal).client.fetch<StoreSearchProductsResponse>(
    "/store/products/search",
    { method: "POST", body },
  );
}

export async function requestSearchRegion(signal: AbortSignal) {
  const { regions } = await searchSdk(signal).store.region.list({
    limit: 100,
    fields: "id,currency_code,*countries",
  });
  return (
    regions.find(
      (region) =>
        region.currency_code.toLowerCase() === "usd" &&
        region.countries?.some(
          (country) => country.iso_2?.toLowerCase() === "us",
        ),
    )?.id ?? null
  );
}
