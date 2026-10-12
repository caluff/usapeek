import type { VendorEarningsResponse } from "@usapeek/api/finance-contracts";
import { formatOrderNumber } from "@usapeek/order-reference";
import Link from "next/link";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataEmpty } from "../workspace/components";
import { formatMoney } from "../workspace/presentation";
import {
  paidSettlementListHref,
  paidSettlementListInput,
} from "./paid-parameters";
import { formatSettlementDate } from "./presentation";

const HEADERS = [
  "Pedido",
  "Fecha de cobro",
  "Total cobrado",
  "Comisión",
  "Neto de venta",
] as const;

export function PaidSettlementView({
  earnings,
  input,
}: {
  earnings: VendorEarningsResponse["earnings"];
  input: ReturnType<typeof paidSettlementListInput>;
}) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-5 border-b pb-5 sm:grid-cols-3">
        {[
          { label: "Total cobrado", amount: earnings.total_amount },
          { label: "Comisión", amount: earnings.total_commission },
          { label: "Tus ganancias", amount: earnings.total_net },
        ].map(({ label, amount }) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatMoney(amount, earnings.filters.currency_code)}
            </dd>
          </div>
        ))}
      </dl>
      {earnings.items.length ? (
        <Table>
          <caption className="sr-only">
            Ventas cobradas, comisión y ganancias del período seleccionado
          </caption>
          <TableHeader>
            <TableRow>
              {HEADERS.map((label, index) => (
                <TableHead
                  key={label}
                  className={index >= 2 ? "text-right" : undefined}
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {earnings.items.map((item) => {
              const orderNumber = formatOrderNumber({
                display_id: item.order_display_id ?? undefined,
                custom_display_id: item.order_custom_display_id ?? undefined,
              });
              return (
                <TableRow
                  key={item.order_id}
                  className="relative focus-within:bg-muted/45"
                >
                  <TableCell>
                    <Link
                      href={`/seller/orders/${item.order_id}`}
                      aria-label={`Ver pedido ${orderNumber}`}
                      className="block whitespace-nowrap font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring"
                    >
                      {orderNumber}
                    </Link>
                    {item.coverage !== "complete" ? (
                      <Badge variant="warning" className="mt-1">
                        En verificación
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatSettlementDate(
                      item.captured_at,
                      earnings.window.time_zone,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(
                      item.total_amount,
                      earnings.filters.currency_code,
                    )}
                    {item.refunded_amount > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reembolsos:{" "}
                        {formatMoney(
                          item.refunded_amount,
                          earnings.filters.currency_code,
                        )}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(
                      item.commission_amount,
                      earnings.filters.currency_code,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {formatMoney(
                      item.net_amount,
                      earnings.filters.currency_code,
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <DataEmpty
          title={
            earnings.count > 0
              ? "No hay cobros en esta página"
              : "No hay cobros en este período"
          }
          description={
            earnings.count > 0
              ? "Regresa a la primera página para ver las ventas cobradas."
              : "Las ventas aparecerán aquí cuando se confirme su cobro. Puedes consultar otro período."
          }
        />
      )}
      <TablePagination
        label="Páginas de cobrados"
        count={earnings.count}
        offset={input.query.offset}
        limit={input.query.limit}
        itemCount={earnings.items.length}
        hrefForOffset={(offset) =>
          paidSettlementListHref(input, offset / input.query.limit + 1)
        }
      />
    </div>
  );
}

export function PaidSettlementListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-5">
      <p role="status" className="sr-only">
        Cargando ventas cobradas
      </p>
      <div
        aria-hidden="true"
        className="grid gap-5 border-b pb-5 sm:grid-cols-3"
      >
        {[0, 1, 2].map((item) => (
          <div key={item}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-7 w-44" />
          </div>
        ))}
      </div>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            {HEADERS.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3, 4].map((row) => (
            <TableRow key={row}>
              {HEADERS.map((label) => (
                <TableCell key={label}>
                  <Skeleton className="h-5 w-28" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
