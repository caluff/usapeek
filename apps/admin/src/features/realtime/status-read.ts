import { cache } from "react";
import type { AdminNotificationsResponse } from "@usapeek/api/order-notification-contracts";
import { requireAdminReadSdk } from "@/lib/admin-read-sdk";

export const getAdminNotificationStatus = cache(
  async (): Promise<AdminNotificationsResponse> => {
    try {
      const sdk = await requireAdminReadSdk();
      return await sdk.client.fetch<AdminNotificationsResponse>(
        "/admin/notifications",
        { cache: "no-store", signal: AbortSignal.timeout(15_000) },
      );
    } catch {
      return {
        applications: { status: "unavailable" },
        catalog: { status: "unavailable" },
      };
    }
  },
);
