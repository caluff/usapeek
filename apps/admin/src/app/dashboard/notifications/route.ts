import type { AdminNotificationsResponse } from "@usapeek/api/order-notification-contracts";
import {
  adminReadErrorResponse,
  requireAdminReadSdk,
} from "@/lib/admin-read-sdk";

export async function GET(request: Request) {
  try {
    const sdk = await requireAdminReadSdk();
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const result = await sdk.client.fetch<AdminNotificationsResponse>(
      "/admin/notifications",
      {
        query: fresh ? { fresh: "1" } : {},
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
      },
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return adminReadErrorResponse(error);
  }
}
