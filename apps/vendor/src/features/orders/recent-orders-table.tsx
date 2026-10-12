import Link from "next/link";
import type { HttpTypes } from "@mercurjs/types";
import type { OrderDetailDTO } from "@medusajs/types";
import { formatOrderNumber } from "@usapeek/order-reference";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataEmpty, StatusBadge } from "@/features/workspace/components";
import { formatDate, formatMoney } from "@/features/workspace/presentation";
import { getOrderDisplayStatus } from "@/features/orders/status";
import { OrderImages } from "@/features/orders/order-images";
import type { ProductThumbnails } from "./image-data";

export const ORDER_LIST_HEADERS = [
  "Imágenes",
  "Pedido",
  "Cliente",
  "Estado",
  "Fecha",
  "Total",
] as const;

export function RecentOrdersTable({
  orders,
  filtered = false,
  products,
}: {
  orders: (HttpTypes.VendorOrderListResponse["orders"][number] &
    Partial<Pick<OrderDetailDTO, "fulfillments">>)[];
  filtered?: boolean;
  products?: Promise<ProductThumbnails>;
}) {
  if (!orders.length)
    return (
      <DataEmpty
        title={
          filtered
            ? "No hay pedidos con estos filtros"
            : "Todavía no hay pedidos"
        }
        description={
          filtered
            ? "Prueba con otro estado o término de búsqueda."
            : "Los pedidos asignados a esta tienda aparecerán aquí."
        }
      />
    );
  return (
    <Table>
      <caption className="sr-only">Pedidos de esta tienda</caption>
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
        {orders.map((order) => (
          <TableRow
            key={order.id}
            className="relative focus-within:bg-muted/45"
          >
            <TableCell>
              <OrderImages items={order.items} products={products} />
            </TableCell>
            <TableCell>
              <Link
                href={`/seller/orders/${order.id}`}
                className="block min-w-44 text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring"
                aria-label={`Ver pedido ${formatOrderNumber(order)}`}
              >
                <span className="min-w-0">
                  <span className="block whitespace-nowrap">
                    {formatOrderNumber(order)}
                  </span>
                  <span className="block max-w-56 truncate">
                    {order.items?.[0]?.title ?? "Ver pedido"}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {order.items?.length ?? 0} artículos
                  </span>
                </span>
              </Link>
            </TableCell>
            <TableCell>{order.email || "Sin correo"}</TableCell>
            <TableCell>
              <StatusBadge status={getOrderDisplayStatus(order)} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDate(order.created_at)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right font-mono">
              {formatMoney(order.total, order.currency_code)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
