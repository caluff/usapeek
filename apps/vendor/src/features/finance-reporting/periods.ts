import type { FinanceReportingPeriod } from "@usapeek/api/finance-contracts";

export const FINANCE_PERIODS = [
  { value: "today", label: "Hoy" },
  { value: "last_7_days", label: "Últimos 7 días" },
  { value: "last_30_days", label: "Últimos 30 días" },
  { value: "current_month", label: "Mes actual" },
] as const satisfies readonly {
  value: FinanceReportingPeriod;
  label: string;
}[];

export function financePeriodInput(value: unknown): FinanceReportingPeriod {
  return (
    FINANCE_PERIODS.find((period) => period.value === value)?.value ??
    "last_30_days"
  );
}

export function financePeriodHref(
  period: FinanceReportingPeriod,
  page = 1,
  basePath: "/seller" | "/seller/settlements/paid" = "/seller",
) {
  return `${basePath}?${new URLSearchParams({ period, page: String(page) })}`;
}
