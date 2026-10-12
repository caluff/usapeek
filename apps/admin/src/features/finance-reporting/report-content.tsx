import type {
  FinanceReportingPeriod,
  AdminFinanceReportingResponse,
} from "@usapeek/api/finance-contracts";
import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import { Fragment, type ReactNode } from "react";
import { formatOrderNumber } from "@usapeek/order-reference";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { REPORT_PAGE_SIZE } from "./parameters";
import { PendingSettlementsDialog } from "./pending-settlements-dialog";
import { formatReportMoney as displayMoney } from "./presentation";

export const primaryMetrics = {
  merchandise_gmv: "Ventas de mercancía",
  net_marketplace_commission: "Ingresos por comisiones",
  result_after_fees: "Resultado después de tarifas",
  pending_settlement: "Pendiente de liquidar",
} as const;
const activityMetrics = {
  paid_vendor_orders: "Pedidos pagados",
  refunds_effective: "Reembolsos",
} as const;
const reconciliationMetrics = {
  captured_volume: "Capturado en el período",
  net_captured_volume: "Capturado neto",
  gross_marketplace_commission: "Comisión bruta reconocida",
  commission_reversed: "Comisión revertida",
  transfers_gross: "Transferencias brutas del período",
  transfer_reversals: "Reversiones de transferencias",
  transfers_net: "Transferencias netas del período",
  confirmed_stripe_fees: "Tarifas Stripe confirmadas",
} as const;
const reasonLabels: Record<string, string> = {
  reporting_projection_pending:
    "Se están verificando los datos actualizados del informe.",
  reporting_discovery_incomplete:
    "Se están preparando los registros financieros.",
  provider_fee_pending_or_unavailable: "Faltan tarifas de Stripe confirmadas.",
  provider_fee_time_unknown:
    "No se conoce la fecha efectiva de algunas tarifas.",
  provider_fact_unconfirmed:
    "Hay movimientos del proveedor pendientes de conciliación.",
  effective_time_unknown: "Hay movimientos sin fecha efectiva verificable.",
  capture_time_unknown: "No se pudo verificar la fecha de algunas capturas.",
  data_kind_unknown: "Hay movimientos históricos sin clasificación.",
  sales_source_limit_reached:
    "El informe alcanzó el límite de grupos consultados.",
  provider_observation_missing: "Falta una observación financiera de origen.",
  provider_observation_stale:
    "La observación financiera necesita actualizarse.",
  provider_context_revision_stale:
    "Los datos cambiaron después de su conciliación.",
  stored_cost_missing: "Faltan tarifas almacenadas de Stripe.",
};
function displayDate(value: string | null) {
  if (!value) return "—";
  const date = parseISO(value);
  return isValid(date)
    ? intlFormat(
        date,
        {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/Montevideo",
        },
        { locale: "es-UY" },
      )
    : "—";
}

export function FinanceReportContent({
  report,
  period,
  page,
  images,
}: {
  report: AdminFinanceReportingResponse["report"];
  period: FinanceReportingPeriod;
  page: number;
  images: Record<string, ReactNode>;
}) {
  const lastPage = Math.max(
    1,
    Math.ceil(report.sales.length / REPORT_PAGE_SIZE),
  );
  const currentPage = Math.min(page, lastPage);
  const sales = report.sales.slice(
    (currentPage - 1) * REPORT_PAGE_SIZE,
    currentPage * REPORT_PAGE_SIZE,
  );
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Resumen financiero"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {(
          Object.entries(primaryMetrics) as Array<
            [keyof typeof primaryMetrics, string]
          >
        ).map(([key, label]) => (
          <Card
            key={key}
            className={key === "pending_settlement" ? "relative" : undefined}
          >
            <CardHeader
              className={key === "pending_settlement" ? "pb-2 pr-10" : "pb-2"}
            >
              <CardTitle asChild className="text-sm font-medium">
                <h3>{label}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {displayMoney(report.totals[key])}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {key === "merchandise_gmv"
                  ? "No incluye envío."
                  : key === "net_marketplace_commission"
                    ? "Después de reembolsos."
                    : key === "result_after_fees"
                      ? report.totals[key] === null
                        ? "Pendiente de confirmar datos."
                        : "Después de tarifas de Stripe."
                      : "Saldo acumulado al corte."}
              </p>
            </CardContent>
            {key === "pending_settlement" ? (
              <PendingSettlementsDialog report={report} />
            ) : null}
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b pb-3">
        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {(
            Object.entries(activityMetrics) as Array<
              [keyof typeof activityMetrics, string]
            >
          ).map(([key, label]) => (
            <div key={key} className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">
                {key === "paid_vendor_orders"
                  ? (report.totals[key]?.toLocaleString("es-UY") ?? "—")
                  : displayMoney(report.totals[key])}
              </dd>
            </div>
          ))}
        </dl>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              static
              className={
                report.coverage.complete
                  ? "min-h-11 text-success-foreground hover:text-success-foreground"
                  : "min-h-11 text-warning-foreground hover:text-warning-foreground"
              }
            >
              {report.coverage.complete ? (
                <CircleCheck aria-hidden="true" />
              ) : (
                <TriangleAlert aria-hidden="true" />
              )}
              {report.coverage.complete
                ? "Informe completo"
                : "Informe parcial"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {report.coverage.complete
                  ? "Informe completo"
                  : "Informe parcial"}
              </DialogTitle>
              <DialogDescription>
                {report.coverage.complete
                  ? "Los datos del informe tienen cobertura completa."
                  : "El resultado después de tarifas requiere cobertura completa."}
              </DialogDescription>
            </DialogHeader>
            {!report.coverage.complete &&
            report.coverage.partial_reasons.length ? (
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
                {report.coverage.partial_reasons.map(({ reason, count }) => (
                  <li key={reason}>
                    {reasonLabels[reason] ??
                      "Algunos datos no se pudieron verificar."}{" "}
                    ({count})
                  </li>
                ))}
              </ul>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
      <details className="border-b pb-3">
        <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          Desglose para conciliación
        </summary>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {(
            Object.entries(reconciliationMetrics) as Array<
              [keyof typeof reconciliationMetrics, string]
            >
          ).map(([key, label]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {displayMoney(report.totals[key])}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <Table>
        <TableCaption>
          Movimientos con fecha efectiva dentro del período; saldos acumulados
          al corte.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Imágenes</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Ventas de mercancía</TableHead>
            <TableHead>Reembolsos</TableHead>
            <TableHead>Comisiones netas</TableHead>
            <TableHead>Pendiente de liquidar</TableHead>
            <TableHead>Estado de datos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.length ? (
            sales.map((sale) => (
              <Fragment key={sale.order_id}>
                <TableRow>
                  <TableCell>{images[sale.order_id]}</TableCell>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/dashboard/orders/${sale.order_id}`}
                    >
                      {formatOrderNumber({
                        display_id: sale.order_display_id ?? undefined,
                        custom_display_id:
                          sale.order_custom_display_id ?? undefined,
                      })}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {displayMoney(sale.merchandise_collected_in_period)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {displayMoney(sale.refunds_effective)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {displayMoney(sale.net_commission)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {sale.pending_settlement === null
                      ? "—"
                      : displayMoney(sale.pending_settlement)}
                  </TableCell>
                  <TableCell>
                    {sale.coverage === "complete" ? "Completa" : "Parcial"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={7}>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        Ver desglose de{" "}
                        {formatOrderNumber({
                          display_id: sale.order_display_id ?? undefined,
                          custom_display_id:
                            sale.order_custom_display_id ?? undefined,
                        })}
                      </summary>
                      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-muted-foreground">
                            Venta original capturada
                          </dt>
                          <dd>{displayMoney(sale.captured_amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Capturado en el período
                          </dt>
                          <dd>{displayMoney(sale.captured_in_period)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias netas del período
                          </dt>
                          <dd>{displayMoney(sale.transferred_net)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Comisión bruta acumulada
                          </dt>
                          <dd>
                            {sale.gross_commission === null
                              ? "—"
                              : displayMoney(sale.gross_commission)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Comisión reconocida período
                          </dt>
                          <dd>
                            {displayMoney(sale.commission_recognized_in_period)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Comisión revertida período
                          </dt>
                          <dd>{displayMoney(sale.commission_reversed)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias brutas período
                          </dt>
                          <dd>{displayMoney(sale.transfers_gross)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Reversiones período
                          </dt>
                          <dd>{displayMoney(sale.transfer_reversals)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias brutas al corte
                          </dt>
                          <dd>
                            {displayMoney(sale.transfers_gross_to_cutoff)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Reversiones al corte
                          </dt>
                          <dd>
                            {displayMoney(sale.transfer_reversals_to_cutoff)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias netas al corte
                          </dt>
                          <dd>
                            {displayMoney(sale.transferred_net_to_cutoff)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Capturado el
                          </dt>
                          <dd>{displayDate(sale.captured_at)}</dd>
                        </div>
                      </dl>
                    </details>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-muted-foreground"
              >
                {report.freshness.pending_groups ||
                !report.freshness.discovery_complete
                  ? "Se están preparando los datos del informe."
                  : "No hay ventas o reembolsos con movimientos en este período."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {report.sales.length > REPORT_PAGE_SIZE ? (
        <TablePagination
          label="Paginación de pedidos del informe"
          count={report.sales.length}
          offset={(currentPage - 1) * REPORT_PAGE_SIZE}
          limit={REPORT_PAGE_SIZE}
          itemCount={sales.length}
          hrefForOffset={(offset) =>
            `/dashboard?period=${period}&page=${offset / REPORT_PAGE_SIZE + 1}`
          }
        />
      ) : null}
    </div>
  );
}
