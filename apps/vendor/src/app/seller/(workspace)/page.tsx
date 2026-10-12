import type { HttpTypes } from "@mercurjs/types";
import type { VendorFinanceReportingResponse } from "@usapeek/api/finance-contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFinance } from "@/features/dashboard/finance";
import {
  DashboardOrderCount,
  DashboardOrdersProvider,
  DashboardRecentOrders,
} from "@/features/dashboard/orders";
import { productThumbnailsForOrderItems } from "@/features/orders/image-data";
import { FinanceReportToolbar } from "@/features/finance-reporting/toolbar";
import { financePeriodInput } from "@/features/finance-reporting/periods";
import {
  ORDER_LIST_FIELDS,
  resultOf,
  workspace,
} from "@/features/workspace/data";

export const metadata: Metadata = {
  title: "Panel de vendedor",
  description:
    "Consulta el resumen financiero, los pedidos recientes y la actividad de tu tienda en USAPEEK.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; data_kind?: string; page?: string }>;
}) {
  const search = await searchParams;
  const period = financePeriodInput(search.period);
  const { client, membership } = await workspace();
  const finance = resultOf(
    client.get<VendorFinanceReportingResponse>("/vendor/finance/reporting", {
      period,
      mode: "test",
      currency_code: "usd",
      data_kind: "ordinary",
    }),
  );
  const [products, orders, inventory] = [
    resultOf(
      client.get<HttpTypes.VendorProductListResponse>("/vendor/products", {
        limit: 1,
        fields: "id",
      }),
    ),
    resultOf(
      client.get<HttpTypes.VendorOrderListResponse>("/vendor/orders", {
        limit: 5,
        order: "-created_at",
        fields: ORDER_LIST_FIELDS,
      }),
    ),
    resultOf(
      client.get<HttpTypes.VendorInventoryItemListResponse>(
        "/vendor/inventory-items",
        { limit: 1, fields: "id" },
      ),
    ),
  ] as const;
  const thumbnails = orders.then((result) =>
    productThumbnailsForOrderItems(
      result.data?.orders.flatMap((order) => order.items ?? []) ?? [],
    ),
  );
  const metrics = [
    {
      title: "Catálogo disponible",
      result: products,
      href: "/seller/catalog",
      note: "Incluye productos compartidos",
    },
    {
      title: "Pedidos de la tienda",
      result: orders,
      href: "/seller/orders",
      note: "Total de pedidos asignados",
    },
    {
      title: "Artículos de inventario",
      result: inventory,
      href: "/seller/inventory",
      note: "Artículos vinculados a la tienda",
    },
  ];

  return (
    <DashboardOrdersProvider
      key={membership.seller.id}
      sellerId={membership.seller.id}
      initial={orders}
      products={thumbnails}
    >
      <div className="space-y-6">
        <h1 className="sr-only">Panel de vendedor</h1>
        <Card aria-label="Informe financiero">
          <CardContent className="space-y-4 pt-5">
            <FinanceReportToolbar period={period} />
            <Suspense
              key={period}
              fallback={
                <div
                  role="status"
                  aria-label="Cargando informe financiero"
                  className="h-48 animate-pulse bg-muted"
                />
              }
            >
              <DashboardFinance
                key={`${membership.seller.id}:${period}`}
                sellerId={membership.seller.id}
                period={period}
                initial={finance}
              />
            </Suspense>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-3">
          {metrics.map((metric) => (
            <Card key={metric.title}>
              <CardHeader>
                <CardTitle>{metric.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense
                  fallback={
                    <div
                      role="status"
                      aria-label="Cargando total"
                      className="h-16 animate-pulse bg-muted"
                    />
                  }
                >
                  {metric.href === "/seller/orders" ? (
                    <DashboardOrderCount />
                  ) : (
                    <MetricValue result={metric.result} note={metric.note} />
                  )}
                </Suspense>
                <Link
                  href={metric.href}
                  className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
                >
                  Consultar →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Pedidos recientes</CardTitle>
          </CardHeader>
          <Suspense
            fallback={
              <div
                role="status"
                aria-label="Cargando pedidos"
                className="h-64 animate-pulse bg-muted"
              />
            }
          >
            <DashboardRecentOrders />
          </Suspense>
        </Card>
      </div>
    </DashboardOrdersProvider>
  );
}

async function MetricValue({
  result,
  note,
}: {
  result: Promise<{ data?: { count: number }; error?: string }>;
  note: string;
}) {
  const metric = await result;
  return (
    <>
      <p className="font-display text-4xl">{metric.data?.count ?? "—"}</p>
      <p
        className="mt-2 text-xs leading-5 text-muted-foreground"
        role={metric.error ? "alert" : undefined}
      >
        {metric.error ?? note}
      </p>
    </>
  );
}
