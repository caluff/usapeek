import type { FinanceReportingPeriod, FinanceReportingQuery } from "@usapeek/api/finance-contracts";
import { FINANCE_REPORT_PERIODS, financeReportQuery } from "@/features/finance-reporting/parameters";

const PERIOD_LABELS: Record<FinanceReportingPeriod, string> = {
  today: "Hoy",
  last_7_days: "Últimos 7 días",
  last_30_days: "Últimos 30 días",
  current_month: "Mes actual",
};
export const OVERVIEW_REPORT_PERIODS = FINANCE_REPORT_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));

export type OverviewReportFilters = Pick<FinanceReportingQuery, "period"> & { page: number };

export function parseOverviewReportFilters(search: Record<string, string | string[] | undefined>): OverviewReportFilters {
  const query = financeReportQuery(
    typeof search.period === "string" ? search.period : null,
  );
  return {
    period: query.period,
    page: typeof search.page === "string" && /^\d+$/.test(search.page)
      ? Math.max(1, Math.min(Number(search.page), 100_000))
      : 1,
  };
}

export function overviewReportHref(filters: Pick<OverviewReportFilters, "period">) {
  return `/dashboard?${new URLSearchParams({ period: filters.period, page: "1" })}`;
}
