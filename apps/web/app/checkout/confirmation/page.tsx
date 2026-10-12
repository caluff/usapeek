import type { Metadata } from "next"
import type { HttpTypes } from "@medusajs/types"
import { Check } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import { Skeleton } from "@/components/ui/skeleton"
import {
  formatOrderNumber,
  getOrderStatusLabel,
  getShippingStatusLabel,
} from "@/features/account/order-format"
import { getOrderItemThumbnail } from "@/features/account/order-item-image"
import { getReceiptOrders } from "@/features/cart/data"
import { OrderReceiptTotals } from "@/features/cart/components/order-receipt-totals"
import { formatMoney } from "@/features/cart/presentation"
import { OrderFollowUp } from "@/features/checkout/components/order-follow-up"

export const metadata: Metadata = {
  title: "Confirmación del pedido",
  description:
    "Consulta la confirmación de tu compra en USAPEEK, revisa el resumen de tus pedidos y accede a su seguimiento.",
}

export default function ConfirmationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
        Tu pedido
      </h1>
      <Suspense
        fallback={
          <div
            role="status"
            aria-label="Cargando confirmación del pedido"
            className="mt-8 space-y-5"
          >
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        }
      >
        <Receipt />
      </Suspense>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href="/search">Seguir comprando</Link>
        </Button>
        <Suspense
          fallback={
            <Skeleton
              className="h-10 w-36"
              aria-label="Cargando acceso a tus pedidos"
            />
          }
        >
          <OrderFollowUp />
        </Suspense>
      </div>
    </div>
  )
}

async function Receipt() {
  const orders = await getReceiptOrders()
  if (!orders.length) {
    return (
      <p role="status" className="mt-8 border border-border p-6 text-sm">
        No hay un pedido reciente para mostrar en este navegador.
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="flex items-center gap-4 border border-border bg-muted/30 p-5">
        <Check className="size-6 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-semibold">
            {orders.length > 1
              ? "Tus pedidos se registraron correctamente"
              : "Tu pedido se registró correctamente"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conserva el número de referencia de tu compra.
          </p>
        </div>
      </div>
      {orders.map((order) => (
        <OrderReceipt key={order.id} order={order} />
      ))}
    </div>
  )
}

function OrderReceipt({ order }: { order: HttpTypes.StoreOrder }) {
  const address = order.shipping_address

  return (
    <section
      className="border border-border"
      aria-label={`Pedido ${formatOrderNumber(order)}`}
    >
      <div className="border-b border-border p-5 sm:p-6">
        <p className="text-xs font-semibold tracking-wider uppercase">
          Referencia del pedido
        </p>
        <h2 className="mt-2 break-all text-xl font-semibold">
          {formatOrderNumber(order)}
        </h2>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Pedido</dt>
            <dd className="mt-1 font-medium">
              {getOrderStatusLabel(order.status)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Envío</dt>
            <dd className="mt-1 font-medium">
              {getShippingStatusLabel(order.fulfillment_status)}
            </dd>
          </div>
        </dl>
      </div>
      <ul className="divide-y divide-border px-5 sm:px-6">
        {order.items?.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 py-5 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
          >
            <ProductThumbnail
              src={getOrderItemThumbnail(item)}
              alt={item.product_title || item.title}
              className="row-span-2 size-12 sm:size-16"
              sizes="(min-width: 640px) 64px, 48px"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {item.product_title || item.title}
              </p>
              {item.variant_title &&
              item.variant_title !== "Default variant" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.variant_title}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {item.quantity} ×{" "}
                {formatMoney(item.unit_price, order.currency_code)}
              </p>
            </div>
            <p className="col-start-2 text-sm font-medium tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right">
              {formatMoney(item.total, order.currency_code)}
            </p>
          </li>
        ))}
      </ul>
      <OrderReceiptTotals order={order} />
      {address ? (
        <div className="border-t border-border p-5 text-sm leading-relaxed sm:p-6">
          <h3 className="mb-2 font-semibold">Dirección de envío</h3>
          <p>
            {address.first_name} {address.last_name}
          </p>
          <p>
            {address.address_1}
            {address.address_2 ? `, ${address.address_2}` : ""}
          </p>
          <p>
            {address.city}, {address.province?.toUpperCase()}{" "}
            {address.postal_code}
          </p>
          <p>Estados Unidos</p>
          <p className="mt-2 text-muted-foreground">{order.email}</p>
        </div>
      ) : null}
    </section>
  )
}
