"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  createOrderNotificationMonitor,
  ORDER_NOTIFICATION_CHANGED,
} from "./notification-monitor";
import { useSellerNotifications } from "../workspace/seller-notifications";
import { publishDashboardOrderEvent } from "../dashboard/order-events";
import { PendingIndicator } from "@usapeek/ui/pending-indicator";

export function PendingOrderIndicator({ sellerId }: { sellerId: string }) {
  const pathname = usePathname();
  const notifications = useSellerNotifications(sellerId);
  const [hasPendingOrders, setHasPendingOrders] = useState(false);
  const monitor =
    useRef<ReturnType<typeof createOrderNotificationMonitor>>(null);

  useEffect(() => {
    const check = createOrderNotificationMonitor(async (signal, fresh) => {
      const response = await fetch(
        `/seller/order-notifications?seller_id=${encodeURIComponent(sellerId)}${fresh ? "&fresh=1" : ""}`,
        { cache: "no-store", signal },
      );
      if ([401, 403, 409].includes(response.status)) return null;
      if (!response.ok) throw new Error("Order notification unavailable");
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("has_pending_orders" in result) ||
        typeof result.has_pending_orders !== "boolean"
      )
        throw new Error("Invalid order notification");
      return result.has_pending_orders;
    }, setHasPendingOrders);
    monitor.current = check;
    const unsubscribe = notifications?.subscribe({
      eventName: "orders-changed",
      onReady: () => {
        publishDashboardOrderEvent(sellerId);
        void check.check(true);
      },
      onChanged: () => {
        publishDashboardOrderEvent(sellerId);
        void check.check(true);
      },
      onUnavailable: () => {
        publishDashboardOrderEvent(sellerId);
        void check.check();
      },
    });
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void check.check();
      }
    };
    const changed = () => {
      if (document.visibilityState === "visible") {
        publishDashboardOrderEvent(sellerId);
        void check.check(true, true);
      }
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(ORDER_NOTIFICATION_CHANGED, changed);
    return () => {
      check.dispose();
      unsubscribe?.();
      monitor.current = null;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(ORDER_NOTIFICATION_CHANGED, changed);
    };
  }, [sellerId, notifications]);

  useEffect(() => {
    if (document.visibilityState === "visible") void monitor.current?.check();
  }, [pathname]);

  if (!hasPendingOrders) return null;
  return (
    <PendingIndicator
      label="Hay pedidos pendientes"
      data-testid="pending-order-indicator"
      className="pointer-events-none absolute top-1/2 right-3 flex size-3 -translate-y-1/2 items-center justify-center overflow-visible! group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:translate-y-0"
    />
  );
}
