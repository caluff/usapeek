import type {
  FulfillmentDTO,
  HttpTypes,
  ShippingOptionDTO,
} from "@medusajs/types"
import type { SellerDTO } from "@mercurjs/types"
import { cache } from "react"
import { getAccount } from "./data"

export type AccountOrder = Omit<
  HttpTypes.StoreOrder,
  "fulfillments" | "shipping_methods"
> & {
  seller?: Pick<SellerDTO, "id" | "name">
  fulfillments?: (HttpTypes.StoreOrderFulfillment &
    Pick<FulfillmentDTO, "labels" | "items" | "shipping_option">)[]
  shipping_methods:
    | (NonNullable<HttpTypes.StoreOrder["shipping_methods"]>[number] & {
        shipping_option?: Pick<
          ShippingOptionDTO,
          "metadata" | "service_zone"
        > | null
      })[]
    | null
}

export const ACCOUNT_ORDER_FIELDS = [
  "+items.*",
  "+items.detail.*",
  "+items.variant.product.thumbnail",
  "+items.variant.product.images.url",
  "+seller.id",
  "+seller.name",
  "+shipping_address.*",
  "+billing_address.*",
  "+shipping_methods.*",
  "+shipping_methods.shipping_option.service_zone.fulfillment_set.type",
  "+shipping_methods.shipping_option.metadata",
  "+fulfillments.id",
  "+fulfillments.created_at",
  "+fulfillments.packed_at",
  "+fulfillments.shipped_at",
  "+fulfillments.delivered_at",
  "+fulfillments.canceled_at",
  "+fulfillments.shipping_option.service_zone.fulfillment_set.type",
  "+fulfillments.shipping_option.metadata",
  "+fulfillments.labels.tracking_number",
  "+fulfillments.labels.tracking_url",
  "+fulfillments.items.line_item_id",
  "+fulfillments.items.quantity",
  "+original_item_subtotal",
  "+original_shipping_subtotal",
  "+tax_total",
  "+discount_total",
  "+discount_tax_total",
  "+credit_line_total",
].join(",")

export const getAccountOrder = cache(
  async (id: string): Promise<AccountOrder | null> => {
    const { sdk } = await getAccount()
    if (!/^order_[a-zA-Z0-9]+$/.test(id)) return null
    // Listing is customer-scoped. Public single-order retrieval cannot protect this page.
    const { orders } = await sdk.store.order.list({
      id,
      limit: 1,
      fields: ACCOUNT_ORDER_FIELDS,
    })
    return (orders[0] as AccountOrder | undefined) ?? null
  },
)
