import type { HttpTypes, ProductChangeDTO } from "@mercurjs/types";
import { FetchError } from "@medusajs/js-sdk";
import type Medusa from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isProductReviewId, type parseProductReviewFilters } from "./helpers";
import {
  productCreatorId,
  type ReviewCommerce,
  type ReviewOffer,
} from "./commerce";

export async function listProductsForReview(
  filters: ReturnType<typeof parseProductReviewFilters>,
) {
  const sdk = await requireAdminSdk();
  // Mercur overrides the Medusa product response with change-review relations.
  return sdk.client.fetch<HttpTypes.AdminProductListResponse>(
    "/admin/products",
    {
      query: {
        q: filters.q || undefined,
        limit: filters.limit,
        offset: filters.offset,
        ...(filters.status === "all" ? {} : { status: [filters.status] }),
        fields:
          "id,title,status,updated_at,thumbnail,images.id,images.url,variants.id,changes.id,changes.status,changes.created_by,changes.actions.action",
      },
      cache: "no-store",
    },
  );
}

async function listReviewOffers(sdk: Medusa, variantIds: string[]) {
  const offers: ReviewOffer[] = [];
  for (let index = 0; index < variantIds.length; index += 100) {
    const batch = variantIds.slice(index, index + 100);
    for (let offset = 0; ; offset += 100) {
      const page = await sdk.client.fetch<
        Omit<HttpTypes.AdminOfferListResponse, "offers"> & {
          offers: ReviewOffer[];
        }
      >("/admin/offers", {
        query: {
          variant_id: batch,
          limit: 100,
          offset,
          fields:
            "id,variant_id,seller_id,seller.id,seller.name,prices.amount,prices.currency_code,prices.min_quantity,prices.max_quantity,prices.price_rules.attribute",
        },
        cache: "no-store",
      });
      offers.push(...page.offers);
      if (offset + page.offers.length >= page.count) break;
      if (!page.offers.length) throw new Error("Incomplete product offers");
    }
  }
  return offers;
}

export async function listProductReviewCommerce(
  products: HttpTypes.AdminProductListResponse["products"],
): Promise<ReviewCommerce> {
  const sdk = await requireAdminSdk();
  const variantIds = [
    ...new Set(
      products.flatMap(
        (product) => product.variants?.map((variant) => variant.id) ?? [],
      ),
    ),
  ];
  const creatorIds = [
    ...new Set(
      products.flatMap((product) => {
        const id = productCreatorId(product);
        return id ? [id] : [];
      }),
    ),
  ];
  const unavailable = (error: unknown) => {
    unstable_rethrow(error);
    return null;
  };
  const offers = listReviewOffers(sdk, variantIds).catch(unavailable);
  const sellers = creatorIds.length
    ? sdk.client
        .fetch<HttpTypes.AdminSellerListResponse>("/admin/sellers", {
          query: {
            id: creatorIds,
            limit: creatorIds.length,
            fields: "id,name",
          },
          cache: "no-store",
        })
        .then((result) => result.sellers)
        .catch(unavailable)
    : Promise.resolve([]);
  const [resolvedOffers, resolvedSellers] = await Promise.all([
    offers,
    sellers,
  ]);
  return { offers: resolvedOffers, sellers: resolvedSellers };
}

export async function retrieveProductForReview(id: string) {
  if (!isProductReviewId(id))
    throw new FetchError("Invalid product ID", "Not Found", 404);
  const sdk = await requireAdminSdk();
  const [result, preview] = await Promise.all([
    sdk.client.fetch<HttpTypes.AdminProductResponse>(
      `/admin/products/${encodeURIComponent(id)}`,
      {
        query: {
          fields:
            "id,title,status,handle,description,subtitle,thumbnail,material,weight,length,width,height,updated_at,images.id,images.url,sellers.id,sellers.name,categories.id,categories.name,variants.id,variants.title,variants.sku,changes.id,changes.status,changes.external_note,changes.created_at",
        },
        cache: "no-store",
      },
    ),
    sdk.client.fetch<{ product_change: ProductChangeDTO | null }>(
      `/admin/products/${encodeURIComponent(id)}/preview`,
      { cache: "no-store" },
    ),
  ]);
  const product: HttpTypes.AdminProductResponse["product"] = result.product;
  return { product, productChange: preview.product_change };
}
