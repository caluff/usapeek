"use client";

import type { HttpTypes } from "@mercurjs/types";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { DataError } from "@/features/workspace/components";
import {
  dashboardResult,
  type DashboardResult,
} from "../dashboard/live-data";
import { publishDashboardOrderEvent } from "../dashboard/order-events";
import { useDashboardLiveData } from "../dashboard/use-live-data";
import type { ProductThumbnails } from "./image-data";
import { orderListDataHref, type OrderListInput } from "./list-query";
import { orderListHref } from "./parameters";
import { RecentOrdersTable } from "./recent-orders-table";
import { useListThumbnails } from "./use-list-thumbnails";

export function LiveOrderList({
  sellerId,
  input,
  initial,
  products,
}: {
  sellerId: string;
  input: OrderListInput;
  initial: DashboardResult<HttpTypes.VendorOrderListResponse>;
  products: Promise<ProductThumbnails>;
}) {
  const update = useDashboardLiveData<HttpTypes.VendorOrderListResponse>(
    sellerId,
    orderListDataHref(sellerId, input),
    "orders",
  );
  const result = dashboardResult(initial, update);
  const thumbnails = useListThumbnails(
    sellerId,
    products,
    update?.clear ? undefined : update?.data?.orders,
  );
  return (
    <div>
      {result.error ? (
        <div className="mb-4 space-y-3">
          {result.data ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {result.error}
            </p>
          ) : (
            <DataError
              message={result.error}
              onRetry={() => publishDashboardOrderEvent(sellerId)}
            />
          )}
          {result.data ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => publishDashboardOrderEvent(sellerId)}
            >
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}
      {result.data ? (
        <>
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
            filtered={input.tab.value !== "all" || Boolean(input.q)}
            products={products}
          />
          <TablePagination
            label="Páginas de pedidos"
            count={result.data.count}
            offset={input.offset}
            limit={input.limit}
            itemCount={result.data.orders.length}
            hrefForOffset={(offset) =>
              orderListHref(input, offset / input.limit + 1)
            }
          />
        </>
      ) : null}
    </div>
  );
}
