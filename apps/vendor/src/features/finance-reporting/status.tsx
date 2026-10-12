import { formatReportDate } from "./presentation";

export function FinanceReportStatus({
  refreshedAt,
  pendingOrders,
  discoveryComplete,
}: {
  refreshedAt: string | null;
  pendingOrders: number;
  discoveryComplete: boolean;
}) {
  return (
    <div className="text-xs text-muted-foreground" role="status">
      {refreshedAt ? (
        <p>Última actualización: {formatReportDate(refreshedAt)}</p>
      ) : null}
      {!discoveryComplete || pendingOrders > 0 ? (
        <p>
          {!discoveryComplete
            ? "Se está verificando el historial de pedidos."
            : `Se ${pendingOrders === 1 ? "está verificando 1 pedido" : `están verificando ${pendingOrders} pedidos`}.`}{" "}
          Los totales estarán disponibles al terminar la verificación.
        </p>
      ) : null}
    </div>
  );
}
