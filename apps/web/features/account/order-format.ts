import type { HttpTypes } from "@medusajs/types"
import { intlFormat } from "date-fns/intlFormat"
import { isValid } from "date-fns/isValid"
import { parseISO } from "date-fns/parseISO"

export { formatOrderNumber } from "@usapeek/order-reference"

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En proceso",
  completed: "Completado",
  draft: "Borrador",
  archived: "Archivado",
  canceled: "Cancelado",
  requires_action: "Requiere atención",
}

const SHIPPING_STATUS_LABELS: Record<
  HttpTypes.StoreOrder["fulfillment_status"],
  string
> = {
  not_fulfilled: "Pendiente de preparación",
  partially_fulfilled: "Preparado parcialmente",
  fulfilled: "Preparado",
  partially_shipped: "Enviado parcialmente",
  shipped: "Enviado",
  partially_delivered: "Entregado parcialmente",
  delivered: "Entregado",
  canceled: "Cancelado",
}

const PAYMENT_STATUS_LABELS: Record<
  HttpTypes.StoreOrder["payment_status"],
  string
> = {
  not_paid: "Sin pagar",
  awaiting: "Pendiente",
  authorized: "Autorizado",
  partially_authorized: "Autorizado parcialmente",
  captured: "Pagado",
  partially_captured: "Pagado parcialmente",
  partially_refunded: "Reembolsado parcialmente",
  refunded: "Reembolsado",
  canceled: "Cancelado",
  requires_action: "Requiere atención",
}

export function formatOrderAmount(amount: number, currencyCode: string) {
  if (!Number.isFinite(amount)) return "No disponible"

  try {
    return new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
    }).format(amount)
  } catch {
    return `${currencyCode.toUpperCase()} ${amount.toFixed(2)}`
  }
}

export function formatOrderDate(value: HttpTypes.StoreOrder["created_at"]) {
  const date = typeof value === "string" ? parseISO(value) : value
  if (!isValid(date)) return "Fecha no disponible"

  return intlFormat(
    date,
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
    { locale: "es-UY" },
  )
}

export function getOrderStatusLabel(status: string) {
  return ORDER_STATUS_LABELS[status] ?? "Estado por confirmar"
}

export function getShippingStatusLabel(
  status: HttpTypes.StoreOrder["fulfillment_status"],
) {
  return SHIPPING_STATUS_LABELS[status] ?? "Estado por confirmar"
}

export function getPaymentStatusLabel(
  status: HttpTypes.StoreOrder["payment_status"],
) {
  return PAYMENT_STATUS_LABELS[status] ?? "Estado por confirmar"
}
