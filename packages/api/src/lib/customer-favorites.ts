import { MedusaError } from "@medusajs/framework/utils";

export const FAVORITE_METADATA_KEY = "account_favorite_product_ids";
export const MAX_FAVORITES = 500;
export const FAVORITE_PRODUCT_ID_PATTERN = /^prod_[a-zA-Z0-9_-]+$/;

export function getFavoriteProductIds(metadata: Record<string, unknown> | null | undefined): string[] {
  const value = metadata?.[FAVORITE_METADATA_KEY];
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter((id): id is string =>
    typeof id === "string" && id.length <= 128 && FAVORITE_PRODUCT_ID_PATTERN.test(id),
  ))];
}

export function prepareFavoriteProductIds(
  metadata: Record<string, unknown> | null | undefined,
  productId: string,
  saved: boolean,
  isPublished: boolean,
): string[] {
  const ids = getFavoriteProductIds(metadata);
  if (!saved) return ids.filter((id) => id !== productId);

  if (!isPublished) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The product is no longer available.");
  }

  if (ids.includes(productId)) return ids;
  if (ids.length >= MAX_FAVORITES) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "You can save up to 500 favorite products.");
  }

  return [...ids, productId];
}
