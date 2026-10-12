import { ArrowUpRight, Package, Truck } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AccountHeading } from "@/features/account/components/account-heading"
import { AccountEmptyState } from "@/features/account/components/empty-state"
import { AccountPagination } from "@/features/account/components/pagination"
import { OrderItems } from "@/features/account/components/order-items"
import {
  getOrderAmounts,
  getOrderItemQuantities,
} from "@/features/account/order-amounts"
import {
  ACCOUNT_PAGE_SIZE,
  getAccount,
  getPageNumber,
} from "@/features/account/data"
import {
  formatOrderAmount,
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getShippingStatusLabel,
} from "@/features/account/order-format"

export const metadata: Metadata = {
  title: "Mis pedidos",
  description:
    "Consulta el historial de tus pedidos en USAPEEK y accede a su estado, detalle y seguimiento desde tu cuenta.",
}
type Props = { searchParams: Promise<{ page?: string | string[] }> }

async function OrderList({ searchParams }: Props) {
  const [{ sdk }, params] = await Promise.all([getAccount(), searchParams])
  const page = getPageNumber(params.page)
  const { orders, count } = await sdk.store.order.list({
    limit: ACCOUNT_PAGE_SIZE,
    offset: (page - 1) * ACCOUNT_PAGE_SIZE,
    order: "-created_at",
    fields:
      "+items.id,+items.title,+items.quantity,+items.detail.*,+items.variant_title,+items.thumbnail,+items.product_handle,+items.variant.product.thumbnail,+items.variant.product.images.url",
  })
  const lastPage = Math.max(1, Math.ceil(count / ACCOUNT_PAGE_SIZE))
  if (page > lastPage) redirect("/account/orders?page=" + lastPage)
  return (
    <>
      {!orders.length ? (
        <AccountEmptyState
          icon={<Package aria-hidden="true" />}
          title="Todavía no tienes órdenes"
        >
          Tus compras aparecerán aquí.
        </AccountEmptyState>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => (
            <article
              key={order.id}
              className="overflow-hidden border border-border bg-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">
                    Orden {formatOrderNumber(order)}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatOrderDate(order.created_at)}
                  </p>
                </div>
                <Badge
                  variant={order.status === "canceled" ? "destructive" : "outline"}
                >
                  {getOrderStatusLabel(order.status)}
                </Badge>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <OrderItems
                    items={(order.items ?? []).slice(0, 2)}
                    currencyCode={order.currency_code}
                    compact
                  />
                  {(order.items?.length ?? 0) > 2 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      +{order.items!.length - 2} productos más
                    </p>
                  ) : null}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-muted-foreground">
                    {order.items?.some(
                      (item) => getOrderItemQuantities(item).returnedQuantity > 0,
                    )
                      ? "Total actual del pedido"
                      : "Total del pedido"}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatOrderAmount(order.total, order.currency_code)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getPaymentStatusLabel(order.payment_status)}
                  </p>
                  {order.items?.some(
                    (item) => getOrderItemQuantities(item).returnedQuantity > 0,
                  ) || (order.summary?.refunded_total ?? 0) > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cobrado:{" "}
                      {formatOrderAmount(
                        getOrderAmounts(order).chargedTotal ?? Number.NaN,
                        order.currency_code,
                      )}
                      {" · "}Reembolsado:{" "}
                      {formatOrderAmount(
                        getOrderAmounts(order).refundedTotal ?? Number.NaN,
                        order.currency_code,
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                {order.status !== "canceled" ? (
                  <p className="flex items-center gap-2 text-xs font-medium">
                    <Truck
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {getShippingStatusLabel(order.fulfillment_status)}
                  </p>
                ) : null}
                <Button asChild variant="outline" className="ml-auto">
                  <Link
                    href={"/account/orders/" + order.id}
                    aria-label={
                      "Ver detalles de la orden " + formatOrderNumber(order)
                    }
                  >
                    Ver pedido
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <AccountPagination
        page={page}
        count={count}
        pageSize={ACCOUNT_PAGE_SIZE}
        href="/account/orders"
      />
    </>
  )
}

export default function OrdersPage(props: Props) {
  return (
    <>
      <AccountHeading title="Mis órdenes" />
      <Suspense
        fallback={
          <Skeleton className="h-64 w-full" aria-label="Cargando pedidos" />
        }
      >
        <OrderList {...props} />
      </Suspense>
    </>
  )
}
