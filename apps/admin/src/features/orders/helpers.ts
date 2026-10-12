import type { HttpTypes } from "@medusajs/types";
import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import { DEFAULT_TABLE_PAGE_SIZE, parseTableOffset } from "@/lib/pagination";
import { logisticsStatus } from "./logistics-status";

export const ORDER_STATUSES = {
  pending: "Abierto",
  completed: "Completado",
  canceled: "Cancelado",
} as const;
export function parseOrderFilters(
  params: Record<string, string | string[] | undefined>,
) {
  const status =
    typeof params.status === "string" &&
    Object.hasOwn(ORDER_STATUSES, params.status)
      ? (params.status as keyof typeof ORDER_STATUSES)
      : ("all" as const);
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    status,
    offset: parseTableOffset(params.offset),
    limit: DEFAULT_TABLE_PAGE_SIZE,
  };
}
export function orderListHref(
  filters: ReturnType<typeof parseOrderFilters>,
  offset: number,
) {
  const query = new URLSearchParams({
    q: filters.q,
    status: filters.status,
    offset: String(Math.max(0, offset)),
  });
  return `/dashboard/orders?${query}`;
}
export function isOrderId(id: string) {
  return /^order_[a-zA-Z0-9]+$/.test(id);
}
export function statusLabel(status: string | undefined) {
  const labels: Record<string, string> = {
    ...ORDER_STATUSES,
    archived: "Archivado",
    requires_action: "Requiere atención",
    not_paid: "Sin pagar",
    awaiting: "En espera",
    authorized: "Autorizado",
    partially_authorized: "Parcialmente autorizado",
    captured: "Cobrado",
    partially_captured: "Parcialmente cobrado",
    refunded: "Reembolsado",
    partially_refunded: "Parcialmente reembolsado",
    not_fulfilled: "Sin preparar",
    partially_fulfilled: "Preparado parcialmente",
    fulfilled: "Preparado",
    partially_shipped: "Enviado parcialmente",
    shipped: "Enviado",
    partially_delivered: "Entregado parcialmente",
    delivered: "Entregado",
  };
  return status ? (labels[status] ?? status) : "Sin informar";
}
export function money(value: number | undefined, currency: string) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return "Sin informar";
  try {
    return new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}
export function safeUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function canComplete(order: HttpTypes.AdminOrder) {
  return (
    order.status === "pending" &&
    Boolean(order.items?.length) &&
    order.items.every((item) => {
      const quantity = item.detail?.quantity;
      const delivered = item.detail?.delivered_quantity;
      return (
        typeof quantity === "number" &&
        Number.isSafeInteger(quantity) &&
        quantity > 0 &&
        typeof delivered === "number" &&
        delivered === quantity
      );
    }) &&
    Array.isArray(order.fulfillments) &&
    order.fulfillments.every((f) => Boolean(f.canceled_at || f.delivered_at))
  );
}
export function logisticsLabel(order: HttpTypes.AdminOrder) {
  const status = logisticsStatus(order);
  return status === "not_fulfilled"
    ? "Pendiente de preparación"
    : statusLabel(status);
}
export function orderDate(value: string | Date | null | undefined) {
  if (
    !value ||
    (typeof value === "string" && !/(Z|[+-]\d{2}:\d{2})$/.test(value))
  )
    return "Sin informar";
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date)
    ? intlFormat(
        date,
        {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/Montevideo",
        },
        { locale: "es-UY" },
      )
    : "Sin informar";
}
export class OrderValidationError extends Error {}
export function orderActionError(error: unknown) {
  return error instanceof OrderValidationError
    ? error.message
    : "No se pudo actualizar el pedido. Actualiza la página para verificar su estado antes de reintentar.";
}
export function canDeliver(order: HttpTypes.AdminOrder, id: string) {
  return (
    order.status === "pending" &&
    Boolean(
      order.fulfillments?.some(
        (f) => f.id === id && !f.canceled_at && f.shipped_at && !f.delivered_at,
      ),
    )
  );
}
export function canCancelFulfillment(order: HttpTypes.AdminOrder, id: string) {
  return (
    order.status === "pending" &&
    Boolean(
      order.fulfillments?.some(
        (fulfillment) =>
          fulfillment.id === id &&
          !fulfillment.canceled_at &&
          !fulfillment.shipped_at &&
          !fulfillment.delivered_at,
      ),
    )
  );
}
export type OrderActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
