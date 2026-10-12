import type Medusa from "@medusajs/js-sdk"
import type { HttpTypes, PaginatedResponse } from "@medusajs/types"
import type { StorefrontOffer } from "@/features/catalog/offers"
import { withTimeout } from "@/lib/catalog-state"
import { cartSdk } from "./data"

const AVAILABILITY_FIELDS = [
  "id",
  "manage_inventory",
  "allow_backorder",
  "inventory_quantity",
  "inventory_item_link.id",
  "inventory_item_link.required_quantity",
  "inventory_item_link.inventory_item_id",
  "inventory_item_link.inventory_item.id",
  "inventory_item_link.inventory_item.location_levels.id",
  "inventory_item_link.inventory_item.location_levels.location_id",
  "inventory_item_link.inventory_item.location_levels.stocked_quantity",
].join(",")

export async function getCartAvailability(
  cart: Pick<HttpTypes.StoreCart, "items">,
  getSdk: () => Promise<Medusa> = cartSdk,
): Promise<StorefrontOffer[]> {
  const offerIds = new Set<string>()
  const productIds = new Set<string>()
  for (const item of cart.items ?? []) {
    const offer: unknown = "offer" in item ? item.offer : undefined
    const canonicalId =
      offer && typeof offer === "object" && "id" in offer ? offer.id : undefined
    const offerId =
      typeof canonicalId === "string" && canonicalId
        ? canonicalId
        : item.metadata?.offer_id
    if (typeof offerId === "string" && offerId) offerIds.add(offerId)
    if (item.product_id) productIds.add(item.product_id)
  }
  if (!offerIds.size || !productIds.size) return []

  return withTimeout(async (signal) => {
    const sdk = await getSdk()
    const offers: StorefrontOffer[] = []
    let count = 0
    do {
      const response = await sdk.client.fetch<
        PaginatedResponse<{ offers: StorefrontOffer[] }>
      >("/store/offers", {
        signal,
        query: {
          id: [...offerIds],
          product_id: [...productIds],
          fields: AVAILABILITY_FIELDS,
          limit: 100,
          offset: offers.length,
        },
      })
      offers.push(...response.offers)
      count = response.count
      if (!response.offers.length) break
    } while (offers.length < count)
    return offers
  }, 8_000)
}
