import type { HttpTypes } from "@medusajs/types";

export function logisticsStatus(order: HttpTypes.AdminOrder) {
  if (order.status === "canceled") return "canceled";
  if (!order.items?.length) return undefined;
  const counters = order.items.map((item) => item.detail);
  if (
    counters.some(
      (detail) =>
        !detail ||
        !Number.isSafeInteger(detail.quantity) ||
        detail.quantity <= 0 ||
        [
          detail.fulfilled_quantity,
          detail.shipped_quantity,
          detail.delivered_quantity,
        ].some(
          (value) =>
            !Number.isSafeInteger(value) ||
            value < 0 ||
            value > detail.quantity,
        ),
    )
  )
    return undefined;
  if (counters.every((detail) => detail.delivered_quantity === detail.quantity))
    return "delivered";
  if (counters.every((detail) => detail.shipped_quantity === detail.quantity))
    return "shipped";
  if (counters.every((detail) => detail.fulfilled_quantity === detail.quantity))
    return "fulfilled";
  return "not_fulfilled";
}
