import { classifyCatalogError, withTimeout } from "@/lib/catalog-state";
import { getStorefrontOffers, getStorefrontRegion } from "@/lib/medusa";
import { requestProductSearch } from "./client";
import type { SearchParameters } from "./parameters";

export async function getSearchResults(parameters: SearchParameters) {
  try {
    const region = await getStorefrontRegion();
    if (!region) return { status: "region_unavailable" as const };
    const result = await withTimeout(
      (signal) => requestProductSearch(parameters, region.id, signal),
      8_000,
    );
    const offers = await getStorefrontOffers(
      result.products.map((product) => product.id),
      region.id,
    );
    return {
      status: "success" as const,
      result,
      offers: parameters.sellerIds.length
        ? offers.filter((offer) =>
            parameters.sellerIds.includes(offer.seller_id),
          )
        : offers,
    };
  } catch (error: unknown) {
    return { status: "error" as const, reason: classifyCatalogError(error) };
  }
}
