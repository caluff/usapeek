import type { HttpTypes } from "@medusajs/types"

type CompletionQuantity =
  "fulfilled_quantity" | "shipped_quantity" | "delivered_quantity"

type ProgressItem = Pick<HttpTypes.StoreOrderLineItem, "quantity"> & {
  detail?:
    | {
        [Key in CompletionQuantity]?:
          HttpTypes.StoreOrderLineItem["detail"][Key] | null
      }
    | null
}

type ProgressOrder = Pick<
  HttpTypes.StoreOrder,
  "status" | "fulfillment_status" | "created_at"
> & { items?: readonly ProgressItem[] | null }

export function getOrderProgress(order: ProgressOrder, isPickup = false) {
  const status = order.fulfillment_status
  const canceled = order.status === "canceled"
  const items = order.items?.filter((item) => item.quantity > 0) ?? []
  const hasCompletedQuantity = (field: CompletionQuantity) =>
    items.length > 0 &&
    items.every((item) => {
      const quantity = item.detail?.[field]
      return typeof quantity === "number" && quantity >= item.quantity
    })
  const prepared =
    ["fulfilled", "shipped", "delivered"].includes(status) ||
    hasCompletedQuantity("fulfilled_quantity")
  const shipped =
    ["shipped", "delivered"].includes(status) ||
    hasCompletedQuantity("shipped_quantity")
  const delivered =
    status === "delivered" || hasCompletedQuantity("delivered_quantity")
  if (isPickup) {
    const collected = order.status === "completed" || delivered
    return [
      { label: "Pedido recibido", complete: true },
      {
        label: "Listo para recoger",
        complete: !canceled && (prepared || collected),
      },
      { label: "Recogido", complete: !canceled && collected },
    ]
  }
  return [
    { label: "Pedido recibido", complete: true },
    { label: "Preparado", complete: !canceled && prepared },
    { label: "Enviado", complete: !canceled && shipped },
    { label: "Entregado", complete: !canceled && delivered },
  ]
}

export function getPickupStatusLabel(order: ProgressOrder) {
  if (order.status === "canceled") return "Pedido cancelado"
  if (order.fulfillment_status === "canceled") return "Preparaciones canceladas"
  const steps = getOrderProgress(order, true)
  if (steps[2].complete) return "Recogido"
  if (steps[1].complete) return "Listo para recoger"
  return order.fulfillment_status === "partially_fulfilled"
    ? "Preparado parcialmente"
    : "Pendiente de preparación"
}

export function safeTrackingUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
