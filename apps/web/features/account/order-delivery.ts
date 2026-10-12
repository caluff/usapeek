import type { ShippingOptionDTO } from "@medusajs/types"
import type { AccountOrder } from "./order-data"

export function isPickupOption(
  option:
    Pick<ShippingOptionDTO, "metadata" | "service_zone"> | null | undefined,
) {
  return (
    option?.service_zone?.fulfillment_set?.type === "pickup" ||
    option?.metadata?.marketplace_v2_pickup === true
  )
}

export function isPickupOrder(order: Pick<AccountOrder, "shipping_methods">) {
  return Boolean(
    order.shipping_methods?.length &&
    order.shipping_methods.every((method) =>
      isPickupOption(method.shipping_option),
    ),
  )
}
