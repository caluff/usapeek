import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import type { OrderDetailDTO } from "@medusajs/types";
import { SettingsOption } from "@/components/ui/settings-option";
import { formatMoney as money } from "../workspace/presentation";
import { OrderFinanceHistory } from "./finance-history";
import { OrderFinanceOperation } from "./finance-operation";

export function OrderFinancePanel({
  data,
  orderStatus,
}: {
  data: OrderFinanceResponse;
  orderStatus: OrderDetailDTO["status"];
}) {
  const finance = data.finance;
  return (
    <section id="order-finance" aria-labelledby="order-finance-title" className="space-y-5">
      <h2
        id="order-finance-title"
        className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
      >
        Finanzas
      </h2>
      <div>
        <SettingsOption
          label="Pago de este pedido"
          value={money(finance.captured_total, finance.currency_code)}
        >
          <dl className="space-y-5 text-sm">
            {[
              {
                label: "Importe asignado",
                value: finance.allocated_total,
                description:
                  "La parte del pago de la compra que corresponde a este pedido.",
              },
              {
                label: "Cobrado",
                value: finance.captured_total,
                description: "El importe cobrado y asignado a este pedido.",
              },
              {
                label: "Reembolsado",
                value: finance.refunded_total,
                description: "El importe que ya se devolvió al comprador.",
              },
              {
                label: "Disponible para reembolso",
                value: finance.refundable_total,
                description:
                  "El saldo que queda para devolver, sujeto a las condiciones de la operación.",
              },
            ].map(({ label, value, description }) => (
              <div key={label}>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-medium">{label}</dt>
                  <dd className="shrink-0 tabular-nums">
                    {money(value, finance.currency_code)}
                  </dd>
                </div>
                <dd className="mt-1 leading-6 text-muted-foreground">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
        </SettingsOption>
        <OrderFinanceOperation finance={finance} operation="refund" />
        {orderStatus !== "completed" ? (
          <OrderFinanceOperation
            finance={finance}
            operation="cancel"
            isCanceled={orderStatus === "canceled"}
          />
        ) : null}
        <SettingsOption
          label="Historial financiero"
          value={
            finance.history.length
              ? `${finance.history.length} ${finance.history.length === 1 ? "operación" : "operaciones"}`
              : "Sin operaciones"
          }
        >
          <OrderFinanceHistory finance={finance} />
        </SettingsOption>
      </div>
    </section>
  );
}
