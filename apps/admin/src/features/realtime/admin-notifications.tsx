"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createAdminNotificationHub } from "./notification-hub";

const AdminNotificationsContext = createContext<ReturnType<
  typeof createAdminNotificationHub
> | null>(null);

export function AdminNotificationsProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const hub = useMemo(
    () =>
      createAdminNotificationHub({
        createSource: () =>
          new EventSource(
            `/dashboard/notifications/stream?account_id=${encodeURIComponent(accountId)}`,
          ),
        isVisible: () => document.visibilityState === "visible",
        observeVisibility: (changed) => {
          document.addEventListener("visibilitychange", changed);
          return () =>
            document.removeEventListener("visibilitychange", changed);
        },
      }),
    [accountId],
  );
  return (
    <AdminNotificationsContext.Provider value={hub}>
      {children}
    </AdminNotificationsContext.Provider>
  );
}

export function useAdminNotifications() {
  return useContext(AdminNotificationsContext);
}
