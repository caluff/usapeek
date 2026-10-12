import type { FinanceReportingQuery } from "@usapeek/api/finance-contracts";

export const FINANCE_REPORT_PERIODS = [
  "today",
  "last_7_days",
  "last_30_days",
  "current_month",
] as const;
export const REPORT_PAGE_SIZE = 10;

export function financeReportQuery(period: string | null): FinanceReportingQuery {
  return {
    period: FINANCE_REPORT_PERIODS.includes(
      period as (typeof FINANCE_REPORT_PERIODS)[number],
    )
      ? (period as FinanceReportingQuery["period"])
      : "last_30_days",
    data_kind: "ordinary",
    mode: "test",
    currency_code: "usd",
  };
}
