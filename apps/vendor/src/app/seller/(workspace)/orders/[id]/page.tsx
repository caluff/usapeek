import type { Metadata } from "next";
import { formatOrderNumber } from "@usapeek/order-reference";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataError,
  PageHeading,
  StatusBadge,
} from "@/features/workspace/components";
import { resultOf } from "@/features/workspace/data";
import { readOrderDetail } from "@/features/orders/detail-read";
import { readOrderCompletion } from "@/features/orders/completion-read";
import { formatDate, formatMoney } from "@/features/workspace/presentation";
import { resourceId } from "@/features/workspace/validation";
import { OrderManagement } from "@/features/orders/order-management";
import { getOrderDisplayStatus } from "@/features/orders/status";
import { OrderItemThumbnail } from "@/features/orders/order-images";
import { productThumbnailsForOrderItems } from "@/features/orders/image-data";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  OrderFinanceRegion,
  OrderFinanceSkeleton,
} from "@/features/orders/finance-region";
import {
  OrderReturnsRegion,
  OrderReturnsSkeleton,
} from "@/features/orders/return-region";

export const metadata: Metadata = {
  title: "Detalle de pedido",
  description: "Revisa los artículos, la entrega y las acciones de gestión de un pedido de tu tienda.",
};
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = resourceId((await params).id);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Detalle del pedido</h1>
      <Suspense
        fallback={
          <Skeleton className="h-96 w-full" aria-label="Cargando pedido" />
        }
      >
        <OrderDetail id={id} />
      </Suspense>
      <Suspense fallback={<OrderFinanceSkeleton />}>
        <OrderFinanceRegion id={id} />
      </Suspense>
      <Suspense fallback={<OrderReturnsSkeleton />}>
        <OrderReturnsRegion id={id} />
      </Suspense>
    </div>
  );
}

async function OrderDetail({ id }: { id: string }) {
  const completion = readOrderCompletion(id);
  const result = await resultOf(readOrderDetail(id));
  if (!result.data) return <DataError message={result.error} />;
  const { order } = result.data;
  const address = order.shipping_address;
  const products = productThumbnailsForOrderItems(order.items ?? []);
  return (
    <div className="space-y-6">
      <PageHeading
        title={`Pedido ${formatOrderNumber(order)}`}
        description={`${formatDate(order.created_at)} · ${order.email || "Sin correo"}`}
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={getOrderDisplayStatus(order)} />
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            Pago de la compra <StatusBadge status={order.payment_status} />
          </span>
        </div>
      </PageHeading>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Artículos</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio unitario</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <OrderItemThumbnail item={item} products={products} />
                      <span>{item.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    {formatMoney(item.unit_price, order.currency_code)}
                  </TableCell>
                  <TableCell>
                    {formatMoney(item.total, order.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CardContent className="pt-6">
            <p className="flex justify-between font-semibold">
              <span>Total del pedido</span>
              <span className="font-mono">
                {formatMoney(order.total, order.currency_code)}
              </span>
            </p>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dirección de entrega</CardTitle>
            </CardHeader>
            <CardContent>
              <address className="text-sm not-italic leading-6">
                {address ? (
                  <>
                    {[address.first_name, address.last_name]
                      .filter(Boolean)
                      .join(" ")}
                    <br />
                    {address.address_1}
                    {address.address_2 ? (
                      <>
                        <br />
                        {address.address_2}
                      </>
                    ) : null}
                    <br />
                    {[address.city, address.province, address.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                    <br />
                    {address.country_code?.toUpperCase()}
                  </>
                ) : (
                  "Sin dirección de entrega."
                )}
              </address>
            </CardContent>
          </Card>
        </div>
      </div>
      <OrderManagement
        order={order}
        products={products}
        completion={completion}
      />
    </div>
  );
}
