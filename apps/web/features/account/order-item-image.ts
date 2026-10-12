import type { HttpTypes } from "@medusajs/types"
import { getProductImage } from "@/features/catalog/image"

export function getOrderItemThumbnail(item: HttpTypes.StoreOrderLineItem) {
  return (
    getProductImage(item.thumbnail)?.source ??
    getProductImage(item.variant?.product?.thumbnail)?.source ??
    getProductImage(item.variant?.product?.images?.[0]?.url)?.source
  )
}
