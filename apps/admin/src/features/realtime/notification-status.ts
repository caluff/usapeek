import type { AdminNotificationsResponse } from "@usapeek/api/order-notification-contracts";

export class NotificationReadError extends Error {
  readonly isDenied: boolean;
  constructor(status: number) {
    super("No se pudo actualizar el estado de las revisiones.");
    this.isDenied = status === 401 || status === 403;
  }
}

export function notificationStatus(value: unknown): AdminNotificationsResponse {
  function valid(entry: unknown) {
    if (typeof entry !== "object" || entry === null || !("status" in entry))
      return false;
    return (
      entry.status === "denied" ||
      entry.status === "unavailable" ||
      (entry.status === "ready" &&
        "has_pending" in entry &&
        typeof entry.has_pending === "boolean")
    );
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("applications" in value) ||
    !("catalog" in value) ||
    !valid(value.applications) ||
    !valid(value.catalog)
  )
    throw new Error("Invalid notification status");
  return value as AdminNotificationsResponse;
}

export async function readNotificationStatus(
  signal: AbortSignal,
  fresh = false,
) {
  const response = await fetch(
    `/dashboard/notifications${fresh ? "?fresh=1" : ""}`,
    {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    },
  );
  if (!response.ok) throw new NotificationReadError(response.status);
  return notificationStatus(await response.json());
}
