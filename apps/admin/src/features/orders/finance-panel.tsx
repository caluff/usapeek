"use client";

import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import { useRef, useState } from "react";
import { SettingsOption } from "@/components/ui/settings-option";
import { money } from "./helpers";
import { OrderFinanceHistory } from "./finance-history";
import { OrderFinanceOperation } from "./finance-operation";

export function OrderFinancePanel({
  data,
  isCanceled,
}: {
  data: OrderFinanceResponse;
  isCanceled: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [saved, setSaved] = useState<{
    source: OrderFinanceResponse;
    result: OrderFinanceResponse;
  } | null>(null);
  const finance = (saved?.source === data ? saved.result : data).finance;
  const amounts = [
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
    ...(!isCanceled
      ? [
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
        ]
      : []),
  ];

  return (
    <section
      id="order-finance"
      aria-labelledby="order-finance-title"
      className="space-y-5"
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
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
            {amounts.map(({ label, value, description }) => (
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
        {(["capture", "refund", "cancel"] as const).map((operation) => (
          <OrderFinanceOperation
            key={operation}
            finance={finance}
            operation={operation}
            fallbackFocusRef={headingRef}
            onSaved={(result) => setSaved({ source: data, result })}
          />
        ))}
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
