import type { VendorFinanceReportingResponse } from "@usapeek/api/finance-contracts";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatReportMoney as displayMoney } from "./presentation";
import { FinanceReportStatus } from "./status";

const primaryMetrics = {
  net_captured_volume: "Ventas netas",
  vendor_earnings: "Tus ganancias",
  transfers_net: "Transferido en el período",
  pending_settlement: "Pendiente de recibir",
} as const;
const activityMetrics = {
  paid_vendor_orders: "Pedidos pagados",
  refunds_effective: "Reembolsos",
} as const;

export function FinanceReportContent({
  report,
}: {
  report: VendorFinanceReportingResponse["report"];
}) {
  return (
    <div className="space-y-4">
      <div className="sr-only">
        <FinanceReportStatus
          refreshedAt={report.freshness.refreshed_at}
          pendingOrders={report.freshness.pending_orders}
          discoveryComplete={report.freshness.discovery_complete}
        />
      </div>
      {!report.coverage.complete ? (
        <div role="status" className="sr-only">
          <p>
            Informe parcial. Los importes mostrados suman únicamente movimientos
            verificados; los datos incompletos se excluyen.
          </p>
        </div>
      ) : null}
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
            className={
              key === "pending_settlement" || key === "vendor_earnings"
                ? "relative cursor-pointer hover:bg-muted/40"
                : undefined
            }
          >
            <CardHeader className="pb-2">
              <CardTitle asChild className="text-sm font-medium">
                <h3>
                  {key === "pending_settlement" || key === "vendor_earnings" ? (
                    <Link
                      href={
                        key === "vendor_earnings"
                          ? `/seller/settlements/paid?${new URLSearchParams({ period: report.filters.period })}`
                          : "/seller/settlements"
                      }
                      className="flex items-center justify-between gap-3 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring"
                    >
                      {label}
                      <ArrowRight
                        className="size-4 shrink-0"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    label
                  )}
                </h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {displayMoney(report.totals[key])}
              </p>
              {key === "net_captured_volume" || key === "pending_settlement" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {key === "net_captured_volume"
                    ? "Cobros menos reembolsos; incluye envío."
                    : "Saldo pendiente acumulado."}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-3 text-sm">
        {(
          Object.entries(activityMetrics) as Array<
            [keyof typeof activityMetrics, string]
          >
        ).map(([key, label]) => (
          <div key={key} className="relative flex items-baseline gap-2">
            <dt className="text-muted-foreground">
              {key === "refunds_effective" ? (
                <Link
                  href="/seller/orders?tab=refunded"
                  className="text-primary hover:underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
                >
                  {label}
                </Link>
              ) : (
                label
              )}
            </dt>
            <dd className="font-medium tabular-nums">
              {key === "paid_vendor_orders"
                ? (report.totals[key]?.toLocaleString("es-UY") ?? "—")
                : displayMoney(report.totals[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
