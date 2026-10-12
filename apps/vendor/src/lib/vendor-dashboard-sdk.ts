import { FetchError } from "@medusajs/js-sdk";
import {
  createVendorSdk,
  getSelectedSellerId,
  getVendorToken,
} from "./auth-sdk";

export const DASHBOARD_HEADERS = { "Cache-Control": "private, no-store" };

export async function vendorDashboardSdk(request: Request) {
  const [token, sellerId] = await Promise.all([
    getVendorToken(),
    getSelectedSellerId(),
  ]);
  if (!token || !sellerId)
    return new Response(null, { status: 401, headers: DASHBOARD_HEADERS });
  if (new URL(request.url).searchParams.get("seller_id") !== sellerId)
    return new Response(null, { status: 409, headers: DASHBOARD_HEADERS });
  const sdk = createVendorSdk(token);
  if (!sdk)
    return new Response(null, { status: 503, headers: DASHBOARD_HEADERS });
  return { sdk, sellerId };
}

export function dashboardReadError(error: unknown) {
  const status =
    error instanceof FetchError && [401, 403, 404].includes(error.status ?? 0)
      ? error.status === 401
        ? 401
        : 403
      : 503;
  return new Response(null, { status, headers: DASHBOARD_HEADERS });
}
