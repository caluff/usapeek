import type { OrderDetailDTO } from "@medusajs/types";

export function getOrderDisplayStatus(
  order: Pick<OrderDetailDTO, "status"> &
    Partial<Pick<OrderDetailDTO, "fulfillments">>,
) {
  if (order.status !== "pending") return order.status;
  // These are display groups only; native order and fulfillment states are unchanged.
  const active = (order.fulfillments ?? []).filter((entry) => !entry.canceled_at);
  if (active.some((entry) => entry.shipped_at || entry.delivered_at))
    return "shipped";
  if (active.some((entry) => entry.packed_at)) return "fulfilled";
  return "pending";
}
