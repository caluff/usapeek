import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type OrderNotificationsService from "../../modules/order-notifications/service";
import type { AdminNotificationEvent } from "../admin-notifications/contracts";

export const ORDER_STREAM_LIFETIME_MS = 60_000;
export const ORDER_STREAM_HEARTBEAT_MS = 20_000;

export type SellerNotificationEvent =
  | "orders-changed"
  | "settlements-changed"
  | "finance-reporting-changed"
  | "catalog-changed";

export type SellerNotificationSubscription = {
  eventName: SellerNotificationEvent;
  subscribe: OrderNotificationsService["subscribe"];
};

type NotificationEvent = SellerNotificationEvent | AdminNotificationEvent;
export type NotificationSubscription = {
  eventName: NotificationEvent;
  subscribe: (changed: () => void, closed: () => void) => Promise<() => void>;
};

export function orderStreamLifetime(authorization?: string, now = Date.now()) {
  if (!authorization?.startsWith("Bearer ")) return ORDER_STREAM_LIFETIME_MS;
  try {
    // Authentication already verified the token. Read expiry only to shorten
    // the connection; never use this unverified decoding to authorize access.
    const payload: unknown = JSON.parse(
      Buffer.from(authorization.slice(7).split(".")[1], "base64url").toString(),
    );
    if (
      typeof payload === "object" &&
      payload !== null &&
      "exp" in payload &&
      typeof payload.exp === "number"
    )
      return Math.max(
        0,
        Math.min(ORDER_STREAM_LIFETIME_MS, payload.exp * 1_000 - now),
      );
  } catch {
    // Session authentication and native token validation remain authoritative.
  }
  return ORDER_STREAM_LIFETIME_MS;
}

export async function openNotificationStream(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  subscriptions: NotificationSubscription[],
) {
  const lifetime = orderStreamLifetime(req.get("authorization"));
  if (!lifetime) return res.status(401).end();
  let closed = false;
  let ready = false;
  const changedBeforeReady = new Set<NotificationEvent>();
  const unsubscribers = new Set<() => void>();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(expiration);
    clearInterval(heartbeat);
    for (const unsubscribe of unsubscribers) unsubscribe();
    unsubscribers.clear();
    req.off("aborted", cleanup);
    res.off("close", cleanup);
    res.off("error", cleanup);
    if (!res.writableEnded) res.end();
  };
  const expiration = setTimeout(cleanup, lifetime);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
  const changed = (eventName: NotificationEvent) => {
    if (closed) return;
    if (!ready) {
      changedBeforeReady.add(eventName);
      return;
    }
    // Slow clients must reconnect rather than accumulate an unbounded buffer.
    if (!res.write(`event: ${eventName}\ndata: {}\n\n`)) cleanup();
  };
  try {
    // Subscribe first, then announce readiness. The client reads current data
    // after ready; mutations racing with that read cannot be missed.
    await Promise.all(
      subscriptions.map(async ({ eventName, subscribe }) => {
        const unsubscribe = await subscribe(
          () => changed(eventName),
          cleanup,
        );
        // An abort or another subscription failing may precede this result.
        if (closed) unsubscribe();
        else unsubscribers.add(unsubscribe);
      }),
    );
    if (closed) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    ready = true;
    if (!res.write("event: ready\ndata: {}\n\n")) cleanup();
    for (const eventName of changedBeforeReady) changed(eventName);
    if (closed) return;
    heartbeat = setInterval(() => {
      if (!closed && !res.write(": heartbeat\n\n")) cleanup();
    }, ORDER_STREAM_HEARTBEAT_MS);
  } catch {
    if (!closed && !res.headersSent) {
      res.setHeader("Cache-Control", "private, no-store");
      res.status(503);
    }
    cleanup();
  }
}

export function openSellerMultiplexNotificationStream(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  subscriptions: SellerNotificationSubscription[],
) {
  return openNotificationStream(
    req,
    res,
    subscriptions.map(({ eventName, subscribe }) => ({
      eventName,
      subscribe: (changed, closed) =>
        subscribe(req.seller_context?.seller_id ?? "", changed, closed),
    })),
  );
}

export function openSellerNotificationStream(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  notifications: Pick<OrderNotificationsService, "subscribe">,
  options: { eventName?: SellerNotificationEvent } = {},
) {
  return openSellerMultiplexNotificationStream(req, res, [
    {
      eventName: options.eventName ?? "orders-changed",
      subscribe: notifications.subscribe.bind(notifications),
    },
  ]);
}

export const openOrderNotificationStream = openSellerNotificationStream;
