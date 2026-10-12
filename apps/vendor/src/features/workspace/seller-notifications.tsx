"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createSellerNotificationHub } from "./notification-hub";

const SellerNotificationsContext = createContext<{
  sellerId: string;
  hub: ReturnType<typeof createSellerNotificationHub>;
} | null>(null);

export function SellerNotificationsProvider({
  sellerId,
  children,
}: {
  sellerId: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      sellerId,
      hub: createSellerNotificationHub({
        createSource: () =>
          new EventSource(
            `/seller/notifications/stream?seller_id=${encodeURIComponent(sellerId)}`,
          ),
        isVisible: () => document.visibilityState === "visible",
        observeVisibility: (changed) => {
          document.addEventListener("visibilitychange", changed);
          return () =>
            document.removeEventListener("visibilitychange", changed);
        },
      }),
    }),
    [sellerId],
  );
  return (
    <SellerNotificationsContext.Provider value={value}>
      {children}
    </SellerNotificationsContext.Provider>
  );
}

export function useSellerNotifications(sellerId: string) {
  const context = useContext(SellerNotificationsContext);
  return context?.sellerId === sellerId ? context.hub : null;
}
