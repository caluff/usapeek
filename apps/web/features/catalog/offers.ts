import type { HttpTypes } from "@medusajs/types"
import type { OfferDTO } from "@mercurjs/types"

// Mercur computes inventory_quantity on Store reads; OfferDTO currently only
// declares the persisted offer fields and its calculated price.
export type StorefrontOffer = OfferDTO &
  Pick<HttpTypes.StoreProductVariant, "inventory_quantity">

export function groupOffersByProduct(offers: readonly StorefrontOffer[]) {
  const offersByProduct = new Map<string, StorefrontOffer[]>()

  for (const offer of offers) {
    const productOffers = offersByProduct.get(offer.product_id)
    if (productOffers) productOffers.push(offer)
    else offersByProduct.set(offer.product_id, [offer])
  }

  return offersByProduct
}

export function getOfferPrice(offer: Pick<OfferDTO, "calculated_price">) {
  const price = offer.calculated_price
  if (
    price?.currency_code?.toLowerCase() !== "usd" ||
    typeof price.calculated_amount !== "number" ||
    !Number.isFinite(price.calculated_amount) ||
    price.calculated_amount < 0
  )
    return null

  return {
    amount: price.calculated_amount,
    originalAmount: price.original_amount,
    currencyCode: price.currency_code,
  }
}

export function getLowestOfferPrice(
  offers: Pick<OfferDTO, "calculated_price">[],
) {
  return offers.reduce<ReturnType<typeof getOfferPrice>>((lowest, offer) => {
    const price = getOfferPrice(offer)
    return price && (!lowest || price.amount < lowest.amount) ? price : lowest
  }, null)
}

export function isOfferAvailable(
  offer: Pick<
    StorefrontOffer,
    "manage_inventory" | "allow_backorder" | "inventory_quantity"
  >,
) {
  return (
    offer.manage_inventory === false ||
    offer.allow_backorder === true ||
    (typeof offer.inventory_quantity === "number" &&
      offer.inventory_quantity > 0)
  )
}

export function formatPrice(amount: number, currencyCode = "usd") {
  return new Intl.NumberFormat("es-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
    currencyDisplay: "code",
  }).format(amount)
}
