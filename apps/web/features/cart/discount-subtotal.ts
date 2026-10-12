import type { HttpTypes } from "@medusajs/types"

export function getDiscountSubtotal(
  totals: Partial<Pick<HttpTypes.StoreCart, "discount_total" | "discount_tax_total">>,
) {
  // tax_total already includes the tax reduction from discounts.
  return (totals.discount_total ?? 0) - (totals.discount_tax_total ?? 0)
}
