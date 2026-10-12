"use client";

import { createContext, use, useContext, type ReactNode } from "react";
import type { HttpTypes } from "@mercurjs/types";
import { CardContent } from "@/components/ui/card";
import { RecentOrdersTable } from "../orders/recent-orders-table";
import type { ProductThumbnails } from "../orders/image-data";
import {
  dashboardResult,
  type DashboardResult,
  type DashboardUpdate,
} from "./live-data";
import { useDashboardLiveData } from "./use-live-data";
import { useOrderThumbnails } from "./use-order-thumbnails";

const OrdersContext = createContext<{
  initial: Promise<DashboardResult<HttpTypes.VendorOrderListResponse>>;
  products: Promise<ProductThumbnails>;
  thumbnails: ProductThumbnails;
  update: DashboardUpdate<HttpTypes.VendorOrderListResponse> | null;
} | null>(null);

export function DashboardOrdersProvider({
  sellerId,
  initial,
  products,
  children,
}: {
  sellerId: string;
  initial: Promise<DashboardResult<HttpTypes.VendorOrderListResponse>>;
  products: Promise<ProductThumbnails>;
  children: ReactNode;
}) {
  const update = useDashboardLiveData<HttpTypes.VendorOrderListResponse>(
    sellerId,
    `/seller/dashboard/orders?seller_id=${encodeURIComponent(sellerId)}`,
    "orders",
  );
  const thumbnails = useOrderThumbnails(
    sellerId,
    products,
    update?.clear ? undefined : update?.data?.orders,
  );
  return (
    <OrdersContext value={{ initial, products, thumbnails, update }}>
      {children}
    </OrdersContext>
  );
}

function useDashboardOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error("Dashboard orders context required");
  return {
    result: dashboardResult(
      context.update?.data || context.update?.clear ? {} : use(context.initial),
      context.update,
    ),
    products: context.products,
    thumbnails: context.thumbnails,
  };
}

export function DashboardOrderCount() {
  const { result } = useDashboardOrders();
  return (
    <>
      <p className="font-display text-4xl">{result.data?.count ?? "—"}</p>
      <p
        className="mt-2 text-xs leading-5 text-muted-foreground"
        role={result.error ? "alert" : undefined}
      >
        {result.error ?? "Total de pedidos asignados"}
      </p>
    </>
  );
}

export function DashboardRecentOrders() {
  const { result, products, thumbnails } = useDashboardOrders();
  return (
    <>
      {result.error ? (
        <CardContent>
          <p role="alert" className="text-sm text-muted-foreground">
            {result.error}
          </p>
        </CardContent>
      ) : null}
      {result.data ? (
        <RecentOrdersTable
          orders={result.data.orders.map((order) => ({
            ...order,
            items: order.items?.map((item) => ({
              ...item,
              thumbnail:
                item.thumbnail ||
                (item.product_id
                  ? thumbnails.get(item.product_id)
                  : undefined) ||
                null,
            })),
          }))}
          products={products}
        />
      ) : null}
    </>
  );
}
