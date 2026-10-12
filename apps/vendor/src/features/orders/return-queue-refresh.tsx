"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSellerNotifications } from "../workspace/seller-notifications";

export function ReturnQueueRefresh({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const notifications = useSellerNotifications(sellerId);
  const [, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());
    const unsubscribe = notifications?.subscribe({
      eventName: "orders-changed",
      onReady: refresh,
      onChanged: refresh,
      onUnavailable: () => {},
    });
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [notifications, router]);
  return null;
}
