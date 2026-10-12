import type { HttpTypes } from "@mercurjs/types";
import { ORDER_LIST_FIELDS } from "@/features/workspace/data";
import {
  DASHBOARD_HEADERS,
  dashboardReadError,
  vendorDashboardSdk,
} from "@/lib/vendor-dashboard-sdk";

export async function GET(request: Request) {
  const context = await vendorDashboardSdk(request);
  if (context instanceof Response) return context;
  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(15_000),
    ]);
    const result =
      await context.sdk.client.fetch<HttpTypes.VendorOrderListResponse>(
        "/vendor/orders",
        {
          query: { limit: 5, order: "-created_at", fields: ORDER_LIST_FIELDS },
          headers: { "x-seller-id": context.sellerId },
          cache: "no-store",
          signal,
        },
      );
    return Response.json(result, { headers: DASHBOARD_HEADERS });
  } catch (error) {
    return dashboardReadError(error);
  }
}
