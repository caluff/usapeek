import type { VendorFinanceReportingResponse } from "@usapeek/api/finance-contracts";
import { financePeriodInput } from "@/features/finance-reporting/periods";
import {
  DASHBOARD_HEADERS,
  dashboardReadError,
  vendorDashboardSdk,
} from "@/lib/vendor-dashboard-sdk";

export async function GET(request: Request) {
  const context = await vendorDashboardSdk(request);
  if (context instanceof Response) return context;
  try {
    const result =
      await context.sdk.client.fetch<VendorFinanceReportingResponse>(
        "/vendor/finance/reporting",
        {
          query: {
            period: financePeriodInput(
              new URL(request.url).searchParams.get("period"),
            ),
            mode: "test",
            currency_code: "usd",
            data_kind: "ordinary",
          },
          headers: { "x-seller-id": context.sellerId },
          cache: "no-store",
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(15_000),
          ]),
        },
      );
    return Response.json(result, { headers: DASHBOARD_HEADERS });
  } catch (error) {
    return dashboardReadError(error);
  }
}
