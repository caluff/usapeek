import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import { ListSearch } from "@/components/list-search";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ORDER_LIST_HEADERS } from "./recent-orders-table";
import {
  ORDER_LIST_FIELDS,
  resultOf,
  workspace,
} from "@/features/workspace/data";
import { ORDER_TABS, orderListHref } from "./parameters";
import { orderListQuery, type OrderListInput } from "./list-query";
import { productThumbnailsForOrderItems } from "./image-data";
import { LiveOrderList } from "./live-list";

export function OrderFilters({ input }: { input: OrderListInput }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <nav
        aria-label="Filtrar pedidos por estado"
        className="flex max-w-full self-start gap-1 overflow-x-auto border-b"
      >
        {ORDER_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={orderListHref({ ...input, tab }, 1)}
            aria-current={input.tab.value === tab.value ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${input.tab.value === tab.value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <ListSearch
        key={`${input.q}:${input.tab.value}`}
        q={input.q}
        label="Buscar pedidos"
        path="/seller/orders"
        placeholder="Número de pedido o correo"
        hidden={{ tab: input.tab.value }}
      />
    </div>
  );
}

export async function OrderList({ input }: { input: OrderListInput }) {
  const { client, membership } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorOrderListResponse>("/vendor/orders", {
      ...orderListQuery(input),
      fields: ORDER_LIST_FIELDS,
    }),
  );
  const products = productThumbnailsForOrderItems(
    (result.data?.orders ?? []).flatMap((order) =>
      (order.items ?? []).slice(0, 3),
    ),
  );
  return (
    <LiveOrderList
      key={`${membership.seller.id}:${input.q}:${input.tab.value}:${input.page}`}
      sellerId={membership.seller.id}
      input={input}
      initial={result}
      products={products}
    />
  );
}

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
              <TableHead
                key={label}
                className={label === "Total" ? "text-right" : undefined}
              >
                {label}
              </TableHead>
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
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1 h-4 w-44" />
                <Skeleton className="mt-1 h-3 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-20" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Skeleton className="mt-5 h-8 w-48" />
    </div>
  );
}
