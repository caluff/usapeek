import type { HttpTypes } from "@medusajs/types"

const FAVORITE_METADATA_KEY = "account_favorite_product_ids"
const PRODUCT_ID_PATTERN = /^prod_[a-zA-Z0-9_-]+$/

export function getFavoriteProductIds(
  metadata: HttpTypes.StoreCustomer["metadata"],
): string[] {
  const value = metadata?.[FAVORITE_METADATA_KEY]
  if (!Array.isArray(value)) return []

  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" &&
          id.length <= 128 &&
          PRODUCT_ID_PATTERN.test(id),
      ),
    ),
  ]
}
