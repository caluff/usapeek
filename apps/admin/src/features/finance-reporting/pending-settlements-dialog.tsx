import type { AdminFinanceReportingResponse } from "@usapeek/api/finance-contracts";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatReportMoney } from "./presentation";

export function PendingSettlementsDialog({
  report,
}: {
  report: AdminFinanceReportingResponse["report"];
}) {
  const settlements = report.pending_settlements;
  const stores = settlements?.stores.filter((store) => store.amount > 0) ?? [];
  const adjustments =
    settlements?.stores.filter((store) => store.amount < 0) ?? [];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          static
          className="absolute inset-0 h-full w-full cursor-pointer rounded-[inherit] hover:bg-muted/20"
          aria-label="Pendiente de liquidar: ver tiendas y montos"
        >
          <ArrowUpRight
            className="absolute right-4 top-4 size-4"
            aria-hidden="true"
          />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tiendas pendientes de liquidación</DialogTitle>
          <DialogDescription>
            Saldo acumulado pendiente de transferir a cada tienda.
          </DialogDescription>
        </DialogHeader>
        {!settlements ? (
          <p className="text-sm text-muted-foreground">
            No se pudo verificar el desglose por tienda. Consulta las
            advertencias del informe.
          </p>
        ) : (
          <div className="space-y-4">
            {!settlements.complete ? (
              <p className="text-sm text-warning-foreground">
                Estos importes corresponden a los movimientos verificados. Hay
                datos pendientes de confirmar.
              </p>
            ) : null}
            {stores.length ? (
              <dl className="space-y-4">
                {stores.map((store) => (
                  <div
                    key={store.seller_id}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <dt className="min-w-0 break-words font-medium">
                      {store.seller_name ? (
                        <Link
                          href={`/dashboard/stores/${store.seller_id}`}
                          className="text-primary hover:underline"
                        >
                          {store.seller_name}
                        </Link>
                      ) : (
                        "Tienda no disponible"
                      )}
                    </dt>
                    <dd className="shrink-0 font-semibold tabular-nums">
                      {formatReportMoney(store.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay tiendas con un saldo verificado pendiente de liquidación.
              </p>
            )}
            {adjustments.length ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  El total del informe también incluye estos saldos negativos:
                </p>
                <dl className="space-y-2">
                  {adjustments.map((store) => (
                    <div
                      key={store.seller_id}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <dt className="min-w-0 break-words">
                        {store.seller_name ?? "Tienda no disponible"}
                      </dt>
                      <dd className="shrink-0 tabular-nums">
                        {formatReportMoney(store.amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
