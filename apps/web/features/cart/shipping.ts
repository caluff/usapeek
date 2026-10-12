import type { HttpTypes } from "@medusajs/types"
import type { HttpTypes as MercurHttpTypes } from "@mercurjs/types"

// Mercur groups Medusa's cart shipping projection by seller.
export type CheckoutShippingOption =
  MercurHttpTypes.StoreSellerShippingOptionsResponse["shipping_options"][string][number] &
    Pick<HttpTypes.StoreCartShippingOptionWithServiceZone, "service_zone" | "amount">

export type CheckoutShippingOptions = Record<string, CheckoutShippingOption[]>

export function isStorePickup(option: CheckoutShippingOption) {
  return option.service_zone?.fulfillment_set?.type === "pickup"
}

export function pickupAddress(option: CheckoutShippingOption) {
  if (!isStorePickup(option)) return null
  const address = option.service_zone?.fulfillment_set?.location?.address
  if (!address?.address_1) return null
  return [
    address.address_1,
    address.address_2,
    address.city,
    address.province?.toUpperCase(),
    address.postal_code,
  ]
    .filter(Boolean)
    .join(", ")
}
