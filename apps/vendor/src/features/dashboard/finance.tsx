"use client";

import { use } from "react";
import type {
  FinanceReportingPeriod,
  VendorFinanceReportingResponse,
} from "@usapeek/api/finance-contracts";
import { FinanceReportContent } from "../finance-reporting/report-content";
import { dashboardResult, type DashboardResult } from "./live-data";
import { useDashboardLiveData } from "./use-live-data";

export function DashboardFinance({
  sellerId,
  period,
  initial,
}: {
  sellerId: string;
  period: FinanceReportingPeriod;
  initial: Promise<DashboardResult<VendorFinanceReportingResponse>>;
}) {
  const update = useDashboardLiveData<VendorFinanceReportingResponse>(
    sellerId,
    `/seller/dashboard/finance?seller_id=${encodeURIComponent(sellerId)}&period=${encodeURIComponent(period)}`,
    "finance",
  );
  const result = dashboardResult(use(initial), update);
  return (
    <>
      {result.error ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}
      {result.data ? (
        <FinanceReportContent report={result.data.report} />
      ) : null}
    </>
  );
}
