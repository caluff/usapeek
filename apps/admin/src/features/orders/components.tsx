import { TablePagination } from "@/components/table-pagination";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatOrderNumber } from "@usapeek/order-reference";
import { FetchError } from "@medusajs/js-sdk";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { cn } from "@/lib/utils";
import {
  listOrders,
  orderProductImages,
  retrieveOrder,
  type OperatorOrder,
} from "./data";
import {
  canComplete,
  orderDate,
  canDeliver,
  canCancelFulfillment,
  isOrderId,
  money,
  ORDER_STATUSES,
  orderListHref,
  parseOrderFilters,
  safeUrl,
  statusLabel,
} from "./helpers";
import { OrderActionForm } from "./action-form";
import { OrderImages, OrderItemImage } from "./order-images";
import {
  OrderLogisticsBadge,
  OrderStatusBadge,
  orderStatusTabClassName,
} from "./status-badge";
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";

const ORDER_LIST_HEADERS = [
  "Imágenes",
  "Pedido / artículos",
  "Tienda",
  "Comprador",
  "Estado",
  "Pago de la compra",
  "Preparación / envío",
  "Total",
];

export function OrderListSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Cargando pedidos
      </p>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            {ORDER_LIST_HEADERS.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton data-slot="thumbnail" className="size-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1 h-3 w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1 h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-36" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Skeleton className="mt-5 h-4 w-20" />
    </div>
  );
}

export function OrderRegionSkeleton() {
  return (
    <div aria-label="Cargando pedidos" className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
function OrderReadError({ href }: { href: string }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-border p-6">
      <p className="text-sm text-muted-foreground">
        No pudimos cargar los pedidos.
      </p>
      <Button asChild size="sm" variant="outline">
        <a href={href}>Reintentar</a>
      </Button>
    </div>
  );
}
export function OrderFilters({
  filters,
}: {
  filters: ReturnType<typeof parseOrderFilters>;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <nav
        aria-label="Estados de pedidos"
        className="flex min-w-0 max-w-full self-start gap-1 overflow-x-auto border-b md:self-auto"
      >
        {Object.entries({ all: "Todos", ...ORDER_STATUSES }).map(
          ([value, label]) => (
            <Link
              key={value}
              href={orderListHref(
                { ...filters, status: value as typeof filters.status },
                0,
              )}
              aria-current={filters.status === value ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                filters.status === value
                  ? orderStatusTabClassName(value)
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ),
        )}
      </nav>
      <form
        action="/dashboard/orders"
        method="get"
        role="search"
        className="relative mb-3 w-full shrink-0 md:mb-0 md:w-52 lg:w-64"
      >
        <label className="sr-only" htmlFor="order-search">
          Buscar pedidos
        </label>
        <Input
          key={filters.q}
          id="order-search"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
          placeholder="Número, email o dirección"
          className="pr-12"
        />
        <input type="hidden" name="status" value={filters.status} />
        <Button
          variant="ghost"
          type="submit"
          size="icon"
          static
          aria-label="Buscar pedidos"
          className="absolute right-1 top-1 size-8"
        >
          <Search aria-hidden="true" strokeWidth={1.5} />
        </Button>
      </form>
    </div>
  );
}
function Seller({ order }: { order: OperatorOrder }) {
  return order.seller ? (
    <Link
      className="relative z-10 inline-block hover:underline"
      href={`/dashboard/stores/${encodeURIComponent(order.seller.id)}`}
    >
      {order.seller.name}
    </Link>
  ) : (
    <>Sin tienda vinculada</>
  );
}
function Buyer({ order }: { order: OperatorOrder }) {
  const name = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      {name && <p className="font-medium">{name}</p>}
      <p className="text-sm text-muted-foreground">
        {order.email || "Sin email"}
      </p>
    </div>
  );
}
export async function OrderResults({
  filters,
}: {
  filters: ReturnType<typeof parseOrderFilters>;
}) {
  const sdk = await requireAdminSdk();
  let result;
  try {
    result = await listOrders(sdk, filters);
  } catch {
    return (
      <AdminAutoRefresh eventName="orders-changed">
        <OrderReadError href={orderListHref(filters, filters.offset)} />
      </AdminAutoRefresh>
    );
  }
  const images = orderProductImages(sdk, result.orders);
  return (
    <AdminAutoRefresh eventName="orders-changed">
      <div>
        {result.orders.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {ORDER_LIST_HEADERS.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.orders.map((order) => (
                <TableRow key={order.id} className="relative">
                  <TableCell>
                    <OrderImages items={order.items} images={images} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/orders/${encodeURIComponent(order.id)}`}
                      aria-label={`Ver pedido ${formatOrderNumber(order)}`}
                      className="whitespace-nowrap font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                    >
                      {formatOrderNumber(order)}
                    </Link>
                    <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                      {orderDate(order.created_at)}
                    </p>
                    <div className="mt-2 space-y-2">
                      {order.items?.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <span className="max-w-48 truncate text-xs">
                            {item.quantity} × {item.title}
                          </span>
                        </div>
                      ))}
                      {order.items?.length > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{order.items.length - 2} artículos
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Seller order={order} />
                  </TableCell>
                  <TableCell>
                    <Buyer order={order} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.payment_status} />
                  </TableCell>
                  <TableCell>
                    <OrderLogisticsBadge order={order} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {money(order.total, order.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No hay pedidos con estos filtros.
          </p>
        )}
        <TablePagination
          label="Páginas de pedidos"
          count={result.count}
          offset={result.offset}
          limit={result.limit}
          itemCount={result.orders.length}
          hrefForOffset={(offset) => orderListHref(filters, offset)}
        />
      </div>
    </AdminAutoRefresh>
  );
}
function OrderDetails({
  order,
  images,
}: {
  order: OperatorOrder;
  images: Promise<Map<string, string>>;
}) {
  const address = order.shipping_address;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Pedido {formatOrderNumber(order)}</CardTitle>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Creado {orderDate(order.created_at)} · hora de Uruguay
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Tienda</p>
            <Seller order={order} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Comprador</p>
            <Buyer order={order} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Pago de la compra
            </p>
            <OrderStatusBadge status={order.payment_status} />
          </div>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Artículos</CardTitle>
            </CardHeader>
            <CardContent>
              {order.items?.length ? (
                <ul className="divide-y divide-border">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex gap-3 py-4 first:pt-0">
                      <OrderItemImage item={item} images={images} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.quantity} ×{" "}
                          {money(item.unit_price, order.currency_code)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Preparados:{" "}
                          {item.detail?.fulfilled_quantity ?? "Sin informar"} ·
                          Enviados:{" "}
                          {item.detail?.shipped_quantity ?? "Sin informar"} ·
                          Entregados:{" "}
                          {item.detail?.delivered_quantity ?? "Sin informar"}
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {money(item.total, order.currency_code)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se recibieron artículos para este pedido.
                </p>
              )}
            </CardContent>
          </Card>
          {order.status !== "canceled" ? (
            <Card>
              <CardHeader>
                <CardTitle>Preparación y seguimiento</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {order.fulfillments?.length ? (
                  order.fulfillments.map((fulfillment, index) => (
                    <div
                      key={fulfillment.id}
                      className="space-y-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          Preparación {index + 1}
                        </p>
                        <OrderStatusBadge
                          status={
                            fulfillment.canceled_at
                              ? "canceled"
                              : fulfillment.delivered_at
                                ? "delivered"
                                : fulfillment.shipped_at
                                  ? "shipped"
                                  : "fulfilled"
                          }
                        />
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        Referencia: {fulfillment.id}
                      </p>
                      {fulfillment.labels?.length ? (
                        <ul className="space-y-2 text-sm">
                          {fulfillment.labels.map((label) => {
                            const url = safeUrl(label.tracking_url);
                            return (
                              <li key={label.id}>
                                {url ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                  >
                                    {label.tracking_number || "Ver seguimiento"}
                                  </a>
                                ) : (
                                  label.tracking_number ||
                                  "Sin número de seguimiento"
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Sin seguimiento registrado.
                        </p>
                      )}
                      <OrderActionForm
                        id={order.id}
                        operation="deliver"
                        fulfillmentId={fulfillment.id}
                        allowed={canDeliver(order, fulfillment.id)}
                      />
                      <OrderActionForm
                        id={order.id}
                        operation="cancel_fulfillment"
                        fulfillmentId={fulfillment.id}
                        allowed={canCancelFulfillment(order, fulfillment.id)}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay preparaciones registradas.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importes</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {[
                  ["Artículos (importe final)", order.item_total],
                  ["Envío", order.shipping_total],
                  ["Descuentos aplicados", order.discount_total],
                  ["Impuestos incluidos", order.tax_total],
                  ["Total", order.total],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex justify-between gap-3"
                  >
                    <dt>{label}</dt>
                    <dd className="font-medium">
                      {money(
                        typeof value === "number" ? value : undefined,
                        order.currency_code,
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dirección de entrega</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {address ? (
                <>
                  <p>
                    {[address.first_name, address.last_name]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  <p>
                    {[address.address_1, address.address_2]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p>
                    {[
                      address.city,
                      address.province,
                      address.postal_code,
                      address.country_code?.toUpperCase(),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {address.phone && <p>{address.phone}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Sin dirección registrada.
                </p>
              )}
              {order.shipping_methods?.map((method) => (
                <p key={method.id} className="text-muted-foreground">
                  {method.name}
                </p>
              ))}
            </CardContent>
          </Card>
          {order.status !== "canceled" ? (
            <Card>
              <CardHeader>
                <CardTitle>Operaciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <OrderActionForm
                  id={order.id}
                  operation="complete"
                  allowed={canComplete(order)}
                />
                {!canComplete(order) &&
                  (order.status === "pending" ? (
                    <p className="text-sm text-muted-foreground">
                      Completar requiere un pedido pendiente con todos sus
                      artículos entregados.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este pedido está {statusLabel(order.status).toLowerCase()}
                      .
                    </p>
                  ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
export async function OrderDetailRegion({ id }: { id: string }) {
  if (!isOrderId(id)) notFound();
  const sdk = await requireAdminSdk();
  let order;
  try {
    order = await retrieveOrder(sdk, id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    return <OrderReadError href={`/dashboard/orders/${id}`} />;
  }
  return (
    <OrderDetails order={order} images={orderProductImages(sdk, [order])} />
  );
}
