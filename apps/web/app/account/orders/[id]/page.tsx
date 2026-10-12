import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft, FileText, MapPin, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { OrderItems } from "@/features/account/components/order-items"
import { OrderTracking } from "@/features/account/components/order-tracking"
import { OrderCancellationRegion } from "@/features/account/components/order-cancellation-region"
import {
  OrderAddress,
  OrderTotals,
} from "@/features/account/components/order-summary"
import { getAccountOrder } from "@/features/account/order-data"
import {
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
} from "@/features/account/order-format"

export const metadata: Metadata = {
  title: "Detalle del pedido",
  description:
    "Consulta los productos, importes, estado y opciones disponibles para un pedido asociado a tu cuenta de USAPEEK.",
}
type Props = { params: Promise<{ id: string }> }

async function OrderContent({ params }: Props) {
  const { id } = await params
  const order = await getAccountOrder(id)
  if (!order) notFound()
  const canceled = order.status === "canceled"
  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="break-all text-2xl font-semibold tracking-tight sm:text-3xl">
              Pedido {formatOrderNumber(order)}
            </h2>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${canceled ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}`}
            >
              <span
                className="size-1.5 rounded-full bg-current"
                aria-hidden="true"
              />
              {getOrderStatusLabel(order.status)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Realizado el {formatOrderDate(order.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={"/account/orders/" + id + "/invoice"}>
              <FileText className="size-4" aria-hidden="true" />
              Ver comprobante
            </Link>
          </Button>
        </div>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold">Resumen de tu compra</h2>
            {order.seller?.name ? (
              <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Store className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  Vendido por{" "}
                  <span className="font-medium text-foreground">
                    {order.seller.name}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
          <div className="p-5 sm:p-6">
            {order.items?.length ? (
              <OrderItems
                items={order.items}
                currencyCode={order.currency_code}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Los productos de esta orden no están disponibles.
              </p>
            )}
            <div className="mt-6">
              <OrderTracking order={order} />
            </div>
          </div>
        </section>
        <aside className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-5 py-4 text-base font-semibold sm:px-6">
            Detalles de tu pedido
          </h2>
          <div className="px-5 sm:px-6">
            <section className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 border-b border-border py-5">
              <h3 className="text-xs font-semibold leading-6">
                Dirección de envío
              </h3>
              <div className="flex min-w-0 items-start gap-3">
                <MapPin
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 break-words">
                  <OrderAddress address={order.shipping_address} />
                </div>
              </div>
            </section>
            <section className="py-5">
              <h3 className="mb-4 text-base font-semibold">Resumen de pago</h3>
              <OrderTotals order={order} highlighted showPaymentHistory={false} />
            </section>
            <div className="flex flex-col items-end pb-3 text-right">
              <Suspense
                fallback={<Skeleton className="my-3 h-5 w-28" aria-label="Consultando cancelación" />}
              >
                <OrderCancellationRegion orderId={id} />
              </Suspense>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

export default function OrderPage(props: Props) {
  return (
    <>
      <Link
        href="/account/orders"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a mis órdenes
      </Link>
      <h1 className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Detalle del pedido
      </h1>
      <Suspense
        fallback={
          <div
            role="status"
            aria-label="Cargando detalle del pedido"
            className="space-y-8"
          >
            <div className="space-y-3">
              <Skeleton className="h-9 w-64 max-w-full" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Skeleton className="h-[32rem] rounded-xl sm:h-96" />
              <Skeleton className="h-[32rem] rounded-xl" />
            </div>
          </div>
        }
      >
        <OrderContent {...props} />
      </Suspense>
    </>
  )
}
