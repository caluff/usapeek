import type { HttpTypes } from "@medusajs/types"

type OrderAmounts = Pick<HttpTypes.StoreOrder, "total"> & {
  summary?: Pick<
    HttpTypes.StoreOrder["summary"],
    "paid_total" | "refunded_total" | "transaction_total"
  >
}

const availableAmount = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? value : null

export function getOrderAmounts(order: OrderAmounts) {
  // Native order totals change when goods are returned. Transactions retain
  // the amounts actually collected and refunded for this individual order.
  return {
    currentTotal: availableAmount(order.total),
    chargedTotal: availableAmount(order.summary?.paid_total),
    refundedTotal: availableAmount(order.summary?.refunded_total),
    netChargedTotal: availableAmount(order.summary?.transaction_total),
  }
}

export function getOrderItemQuantities(
  item: Pick<HttpTypes.StoreOrderLineItem, "quantity"> & {
    detail?: Partial<HttpTypes.StoreOrderLineItem["detail"]>
  },
) {
  const returnedQuantity = Math.min(
    item.quantity,
    (item.detail?.return_received_quantity ?? 0) +
      (item.detail?.return_dismissed_quantity ?? 0),
  )
  return {
    orderedQuantity: item.quantity,
    returnedQuantity,
    currentQuantity: Math.max(0, item.quantity - returnedQuantity),
  }
}
