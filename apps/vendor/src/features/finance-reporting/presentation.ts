import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import type { FinanceReportingSale } from "@usapeek/api/finance-contracts";

export function partitionReportSales(sales: FinanceReportingSale[]) {
  const verified: FinanceReportingSale[] = [];
  const unverified: FinanceReportingSale[] = [];
  for (const sale of sales) {
    if (sale.coverage !== "complete" || sale.capture_status === "unknown") {
      unverified.push(sale);
    } else if (
      sale.captured_in_period !== 0 ||
      sale.refunds_effective !== 0 ||
      sale.seller_earnings !== 0 ||
      sale.transferred_net !== 0
    ) {
      verified.push(sale);
    }
  }
  return { verified, unverified };
}

const money = new Intl.NumberFormat("es-UY", {
  style: "currency",
  currency: "USD",
});

export function formatReportMoney(value: number | null) {
  return value === null ? "—" : money.format(value);
}

export function formatReportDate(value: string | null) {
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
