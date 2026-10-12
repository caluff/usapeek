"use client";

import { useEffect, useState } from "react";
import { useSellerNotifications } from "../workspace/seller-notifications";
import { subscribeDashboardOrderEvents } from "./order-events";
import { createLiveReadQueue } from "./live-read-queue";
import {
  DashboardReadError,
  readDashboardData,
  type DashboardUpdate,
} from "./live-data";

export function useDashboardLiveData<T>(
  sellerId: string,
  url: string,
  topic: "orders" | "finance",
) {
  const notifications = useSellerNotifications(sellerId);
  const [update, setUpdate] = useState<DashboardUpdate<T> | null>(null);
  useEffect(() => {
    const queue = createLiveReadQueue<T>({
      read: (signal) => readDashboardData<T>(url, signal),
      onData: (data) => setUpdate({ data }),
      onError: (error) =>
        setUpdate((previous) => ({
          data: previous?.data,
          error:
            error instanceof DashboardReadError
              ? error.message
              : "No se pudo actualizar esta información. Se volverá a intentar automáticamente.",
          clear:
            previous?.clear ||
            (error instanceof DashboardReadError && error.isDenied),
        })),
      shouldRetry: (error) =>
        !(error instanceof DashboardReadError && error.isDenied),
    });
    const unsubscribeFinance =
      topic === "finance"
        ? notifications?.subscribe({
            eventName: "finance-reporting-changed",
            onReady: queue.request,
            onChanged: queue.request,
            onUnavailable: queue.request,
          })
        : undefined;
    const unsubscribe =
      topic === "orders"
        ? subscribeDashboardOrderEvents(sellerId, () => {
            if (document.visibilityState === "visible") queue.request();
          })
        : () => {};
    function visibilityChanged() {
      if (document.visibilityState === "visible") {
        queue.request();
      } else {
        queue.pause();
      }
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      unsubscribe();
      unsubscribeFinance?.();
      queue.dispose();
    };
  }, [sellerId, url, topic, notifications]);
  return update;
}
