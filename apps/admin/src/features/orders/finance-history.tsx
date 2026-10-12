import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import { money, orderDate } from "./helpers";

export function OrderFinanceHistory({
  finance,
}: {
  finance: OrderFinanceResponse["finance"];
}) {
  return (
    <section className="space-y-3" aria-label="Historial financiero">
      {finance.history.length ? (
        <ul className="divide-y">
          {finance.history.map((entry) => (
            <li
              key={entry.id}
              className="space-y-1 py-3 text-sm first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {
                    {
                      cancel: "Cancelación",
                      refund: "Reembolso",
                      capture: "Cobro",
                    }[entry.kind]
                  }{" "}
                  · {money(entry.amount, finance.currency_code)}
                </span>
                <span>
                  {
                    {
                      processing: "En proceso",
                      complete: "Completado",
                      uncertain: "Pendiente de verificación",
                    }[entry.status]
                  }
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {entry.note}
              </p>
              <p className="text-xs text-muted-foreground">
                {orderDate(entry.created_at)}
              </p>
              {entry.seller_reversed !== undefined ? (
                <p className="text-muted-foreground">
                  Recuperado del vendedor:{" "}
                  {money(entry.seller_reversed, finance.currency_code)}
                </p>
              ) : null}
              {entry.commission_returned !== undefined ? (
                <p className="text-muted-foreground">
                  Comisión devuelta por el marketplace:{" "}
                  {money(entry.commission_returned, finance.currency_code)}
                </p>
              ) : null}
              {entry.status === "uncertain" ? (
                <p className="text-sm">
                  Verifica el resultado antes de iniciar otra operación.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sin operaciones financieras registradas.
        </p>
      )}
    </section>
  );
}
