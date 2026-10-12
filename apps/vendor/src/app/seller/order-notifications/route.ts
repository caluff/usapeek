import type { VendorOrderNotificationsResponse } from "@usapeek/api/order-notification-contracts";
import { FetchError } from "@medusajs/js-sdk";
import {
  createVendorSdk,
  getSelectedSellerId,
  getVendorToken,
} from "@/lib/auth-sdk";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const [token, sellerId] = await Promise.all([
    getVendorToken(),
    getSelectedSellerId(),
  ]);
  if (!token || !sellerId)
    return new Response(null, { status: 401, headers: RESPONSE_HEADERS });
  if (new URL(request.url).searchParams.get("seller_id") !== sellerId)
    return new Response(null, { status: 409, headers: RESPONSE_HEADERS });
  const sdk = createVendorSdk(token);
  if (!sdk)
    return new Response(null, { status: 503, headers: RESPONSE_HEADERS });

  try {
    // Backend middleware reauthorizes membership, store status and order access.
    // Avoid a second membership-list read solely for this lightweight indicator.
    const result = await sdk.client.fetch<VendorOrderNotificationsResponse>(
      "/vendor/order-notifications",
      {
        query:
          new URL(request.url).searchParams.get("fresh") === "1"
            ? { fresh: "1" }
            : undefined,
        headers: { "x-seller-id": sellerId },
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(9_500)]),
      },
    );
    return Response.json(result, { headers: RESPONSE_HEADERS });
  } catch (error) {
    const status =
      error instanceof FetchError && [401, 403, 404].includes(error.status ?? 0)
        ? error.status === 401
          ? 401
          : 403
        : 503;
    return new Response(null, { status, headers: RESPONSE_HEADERS });
  }
}
