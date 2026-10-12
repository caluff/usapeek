import type Medusa from "@medusajs/js-sdk";
import type {
  FinanceReportingQuery,
  AdminFinanceReportingResponse,
} from "@usapeek/api/finance-contracts";

export function readFinanceReport(
  sdk: Medusa,
  query: FinanceReportingQuery,
  signal?: AbortSignal,
) {
  return sdk.client.fetch<AdminFinanceReportingResponse>(
    "/admin/finance/reporting",
    {
      query,
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    },
  );
}
