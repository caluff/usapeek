import type { StoreOrderTrackingResponse } from "@usapeek/api/order-tracking-contracts"
import { Check, ExternalLink, Package, Store, Truck } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import {
  formatOrderAmount,
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
  getShippingStatusLabel,
} from "@/features/account/order-format"
import {
  getPickupStatusLabel,
  safeTrackingUrl,
} from "@/features/account/order-progress"
import { getTrackingProgress } from "./progress"

type TrackingOrder = StoreOrderTrackingResponse["order"]

export function TrackingOrderView({
  order,
  accountAccess,
}: {
  order: TrackingOrder
  accountAccess?: ReactNode
}) {
  const isCanceled = order.status === "canceled"
  const isPickup = order.delivery_mode === "pickup"
  const DeliveryIcon = isPickup ? Store : Truck
  const shipments = order.fulfillments.filter(
    (fulfillment) =>
      fulfillment.delivery_mode === "pickup" ||
      fulfillment.shipped_at ||
      fulfillment.delivered_at ||
      fulfillment.canceled_at ||
      fulfillment.labels.some(
        (label) => label.tracking_number || label.tracking_url,
      ),
  )

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="break-all text-2xl font-semibold tracking-tight">
            {formatOrderNumber({
              display_id: order.display_id,
              custom_display_id: order.custom_display_id ?? undefined,
            })}
          </h2>
          <Badge
            variant={
              isCanceled
                ? "destructive"
                : order.status === "completed"
                  ? "success"
                  : order.status === "requires_action"
                    ? "warning"
                    : "neutral"
            }
          >
            {getOrderStatusLabel(order.status)}
          </Badge>
        </div>
        <p className="ml-auto text-right text-sm text-muted-foreground">
          Realizado el {formatOrderDate(order.created_at)}
        </p>
      </header>
      {accountAccess}
      <section aria-labelledby="tracking-shipping-title" className="space-y-6">
        <div className="flex items-start gap-4 bg-muted/40 p-5 sm:p-6">
          <DeliveryIcon
            className="mt-0.5 size-6 shrink-0 text-brand-accent-text"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <h3 id="tracking-shipping-title" className="text-sm font-medium">
              {isPickup ? "Estado de la recogida" : "Estado del envío"}
            </h3>
            <p className="mt-1 text-xl font-semibold">
              {isCanceled
                ? "Pedido cancelado"
                : isPickup
                  ? getPickupStatusLabel(order)
                  : getShippingStatusLabel(order.fulfillment_status)}
            </p>
          </div>
        </div>
        {!isCanceled && order.fulfillment_status !== "canceled" ? (
          <ShippingProgress order={order} />
        ) : null}
        {shipments.length ? (
          <ul className="space-y-6">
            {shipments.map((fulfillment, index) => {
              const isPickupFulfillment = fulfillment.delivery_mode === "pickup"
              return (
                <li key={fulfillment.id} className="space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <Package className="size-4" aria-hidden="true" />
                    {isPickupFulfillment ? "Recogida" : "Envío"} {index + 1}
                    {fulfillment.canceled_at ? (
                      <Badge variant="neutral">Cancelado</Badge>
                    ) : null}
                  </h4>
                  <dl className="space-y-2 text-sm">
                    {[
                      ...(isPickupFulfillment
                        ? [
                            [
                              "Listo para recoger",
                              fulfillment.packed_at ?? fulfillment.created_at,
                            ],
                          ]
                        : [["Enviado", fulfillment.shipped_at]]),
                      [
                        isPickupFulfillment ? "Recogido" : "Entregado",
                        fulfillment.delivered_at,
                      ],
                      ["Cancelado", fulfillment.canceled_at],
                    ].map(([label, date]) =>
                      date ? (
                        <div
                          key={label}
                          className="flex flex-wrap gap-x-4 gap-y-1"
                        >
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{formatOrderDate(date)}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                  {isPickupFulfillment &&
                  !fulfillment.canceled_at &&
                  !fulfillment.delivered_at &&
                  order.status === "completed" ? (
                    <p className="text-sm">Recogido</p>
                  ) : null}
                  {!isPickupFulfillment &&
                  !fulfillment.canceled_at &&
                  !isCanceled ? (
                    <ul className="space-y-1">
                      {fulfillment.labels.map((label, labelIndex) => {
                        const href = safeTrackingUrl(label.tracking_url)
                        return href || label.tracking_number ? (
                          <li key={labelIndex} className="text-sm">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                                className="inline-flex min-h-11 max-w-full items-center gap-2 font-medium text-brand-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                              >
                                <span className="break-all">
                                  Rastrear envío
                                  {label.tracking_number
                                    ? `: ${label.tracking_number}`
                                    : ""}
                                </span>
                                <ExternalLink
                                  className="size-4 shrink-0"
                                  aria-hidden="true"
                                />
                              </a>
                            ) : (
                              <p className="break-all text-muted-foreground">
                                Seguimiento: {label.tracking_number}
                              </p>
                            )}
                          </li>
                        ) : null
                      })}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>
      <section aria-labelledby="tracking-products-title">
        <h3 id="tracking-products-title" className="text-lg font-semibold">
          Tu compra
        </h3>
        {order.items.length ? (
          <ul className="mt-5 space-y-5">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start gap-4">
                <ProductThumbnail
                  src={item.thumbnail}
                  alt={item.title}
                  className="size-16 shrink-0"
                  sizes="64px"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.variant_title &&
                  item.variant_title !== "Default variant" ? (
                    <p className="text-xs text-muted-foreground">
                      {item.variant_title}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} ×{" "}
                    {formatOrderAmount(item.unit_price, order.currency_code)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Los productos de este pedido no están disponibles.
          </p>
        )}
        <dl className="mt-6 flex items-center justify-between gap-4 border-t border-dashed border-border pt-5">
          <dt className="font-semibold">Total del pedido</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {formatOrderAmount(order.total, order.currency_code)}
          </dd>
        </dl>
      </section>
      <p className="text-xs leading-5 text-muted-foreground">
        Este enlace es privado. Consérvalo para consultar tu pedido y no lo
        compartas.
      </p>
    </div>
  )
}

function ShippingProgress({ order }: { order: TrackingOrder }) {
  const steps = getTrackingProgress(order)
  const currentStep = steps.findIndex((step) => !step.complete)

  return (
    <ol
      className={`grid ${order.delivery_mode === "pickup" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}
      aria-label={
        order.delivery_mode === "pickup"
          ? "Progreso de la recogida"
          : "Progreso del envío"
      }
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={index === currentStep ? "step" : undefined}
          className="relative flex gap-4 pb-7 last:pb-0 sm:block sm:pb-0 sm:text-center"
        >
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={`absolute top-8 bottom-0 left-4 w-px sm:top-4 sm:bottom-auto sm:left-[calc(50%+1rem)] sm:h-px sm:w-[calc(100%-2rem)] ${
                steps[index + 1].complete ? "bg-success/60" : "bg-border"
              }`}
            />
          ) : null}
          <span
            className={`relative grid size-8 shrink-0 place-items-center rounded-full border sm:mx-auto sm:mb-3 ${
              step.complete
                ? "border-success/40 bg-success/15 text-success"
                : index === currentStep
                  ? "border-brand-accent bg-brand-accent/10 text-brand-accent-text ring-4 ring-brand-accent/10"
                  : "border-border text-muted-foreground"
            }`}
          >
            {step.complete ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <span className="text-xs" aria-hidden="true">
                {index + 1}
              </span>
            )}
            <span className="sr-only">
              {step.complete
                ? "Completado"
                : index === currentStep
                  ? "Próximo paso"
                  : "Pendiente"}
            </span>
          </span>
          <div className="pt-1 sm:px-1 sm:pt-0">
            <p
              className={`text-xs font-medium ${!step.complete && index !== currentStep ? "text-muted-foreground" : ""}`}
            >
              {step.label}
            </p>
            {step.completedAt ? (
              <time
                dateTime={step.completedAt}
                className="mt-1 block text-xs leading-5 text-muted-foreground"
              >
                {formatOrderDate(step.completedAt)}
              </time>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
