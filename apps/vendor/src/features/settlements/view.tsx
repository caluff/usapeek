import type {
  VendorSettlementItem,
  VendorSettlementsResponse,
} from "@usapeek/api/finance-contracts";
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
import { DataEmpty } from "@/features/workspace/components";
import { formatMoney } from "@/features/workspace/presentation";
import { settlementListHref, settlementListInput } from "./parameters";
import { formatSettlementDate } from "./presentation";

const HEADERS = [
  "Pedido",
  "Completado",
  "Liberación prevista",
  "Estado",
  "Pendiente",
] as const;

const STATUS_LABELS: Record<VendorSettlementItem["status"], string> = {
  waiting: "En espera",
  due: "Fecha cumplida",
  processing: "Procesando",
  needs_review: "En revisión",
};

// The registry currently reports a pending refresh through needs_review too.
const REFRESH_REASON =
  "El importe pendiente se está verificando. Actualiza en unos minutos.";

export function SettlementView({
  settlements,
  input,
}: {
  settlements: VendorSettlementsResponse["settlements"];
  input: ReturnType<typeof settlementListInput>;
}) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-5 border-b pb-5 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Total pendiente</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {formatMoney(settlements.total_pending, settlements.currency_code)}
          </dd>
          {settlements.unknown_amount_count > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {settlements.unknown_amount_count}{" "}
              {settlements.unknown_amount_count === 1 ? "pedido" : "pedidos"}{" "}
              con importe por verificar
            </p>
          ) : null}
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            Próxima liberación prevista
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">
            {settlements.next_release_at
              ? formatSettlementDate(
                  settlements.next_release_at,
                  settlements.time_zone,
                )
              : "Sin fecha disponible"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Pedidos pendientes</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {settlements.count}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {settlements.automatic_enabled
          ? "Cada pedido conserva el plazo registrado al completarse y sale de esta lista cuando se confirma la liberación."
          : "La liberación automática está desactivada. Las fechas muestran el vencimiento del plazo registrado en cada pedido."}
      </p>
      {settlements.items.length ? (
        <Table>
          <caption className="sr-only">
            Pedidos completados con cobros pendientes
          </caption>
          <TableHeader>
            <TableRow>
              {HEADERS.map((label) => (
                <TableHead
                  key={label}
                  className={label === "Pendiente" ? "text-right" : undefined}
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlements.items.map((item) => {
              const isRefreshing =
                item.status === "needs_review" &&
                item.reason === REFRESH_REASON;
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
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatSettlementDate(
                      item.completed_at,
                      settlements.time_zone,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatSettlementDate(
                      item.eligible_at,
                      settlements.time_zone,
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "needs_review" && !isRefreshing
                          ? "warning"
                          : "muted"
                      }
                    >
                      {isRefreshing
                        ? "Actualizando datos"
                        : STATUS_LABELS[item.status]}
                    </Badge>
                    {item.status === "needs_review" ? (
                      <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                        {isRefreshing
                          ? "Los datos del cobro se están actualizando."
                          : "El importe o la liberación requiere verificación."}
                      </p>
                    ) : null}
                    {!item.updated_at && !isRefreshing ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pendiente de verificación
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(
                      item.pending_amount,
                      settlements.currency_code,
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
            settlements.count > 0
              ? "No hay pedidos en esta página"
              : "No hay cobros pendientes"
          }
          description={
            settlements.count > 0
              ? "Regresa a la primera página para ver los pedidos pendientes."
              : "Los pedidos completados aparecerán aquí hasta que se confirme su liberación."
          }
        />
      )}
      <TablePagination
        label="Páginas de cobros"
        count={settlements.count}
        offset={input.query.offset}
        limit={input.query.limit}
        itemCount={settlements.items.length}
        hrefForOffset={(offset) =>
          settlementListHref(input, offset / input.query.limit + 1)
        }
      />
    </div>
  );
}

export function SettlementListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-5">
      <p role="status" className="sr-only">
        Cargando cobros pendientes
      </p>
      <div
        aria-hidden="true"
        className="grid gap-5 border-b pb-5 sm:grid-cols-3"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-6 w-44" />
          </div>
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-4 w-72 max-w-full" />
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            {HEADERS.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow key={index}>
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
