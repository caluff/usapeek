import type { HttpTypes } from "@medusajs/types";

type OrderReference = Pick<
  HttpTypes.StoreOrder,
  "display_id" | "custom_display_id"
>;

const ORDER_REFERENCE_PREFIX = "PED-";
const ORDER_REFERENCE_DIGITS = 9;

export function formatOrderNumber(order: OrderReference): string {
  const customDisplayId = order.custom_display_id?.trim();
  if (customDisplayId) return customDisplayId;

  const displayId = order.display_id;
  if (
    typeof displayId !== "number" ||
    !Number.isSafeInteger(displayId) ||
    displayId <= 0
  ) {
    return "Sin número";
  }

  return `${ORDER_REFERENCE_PREFIX}${String(displayId).padStart(ORDER_REFERENCE_DIGITS, "0")}`;
}

export function orderSearchQuery(value: string): string {
  const query = value.trim();
  // Medusa searches the stored number and custom ID, without presentation padding.
  const reference = /^#?(?:PED-)?(\d+)$/i.exec(query);
  return reference?.[1] ? reference[1].replace(/^0+(?=\d)/, "") : query;
}
