"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleHelp } from "lucide-react";
import { PendingIndicator } from "@usapeek/ui/pending-indicator";
import type { AdminNotificationsResponse } from "@usapeek/api/order-notification-contracts";
import { useAdminNotifications } from "@/features/realtime/admin-notifications";
import { createLiveReadQueue } from "@/features/realtime/live-read-queue";
import {
  NotificationReadError,
  readNotificationStatus,
} from "@/features/realtime/notification-status";

const PendingContext = createContext<AdminNotificationsResponse | null>(null);
const SeedContext = createContext<(status: AdminNotificationsResponse) => void>(
  () => {},
);
export const PENDING_APPLICATIONS_CHANGED =
  "marketplace:pending-applications-changed";

export function PendingApplicationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const notifications = useAdminNotifications();
  const [status, setStatus] = useState<AdminNotificationsResponse | null>(null);
  const hasLiveResult = useRef(false);
  const seed = useCallback((value: AdminNotificationsResponse) => {
    if (!hasLiveResult.current) setStatus(value);
  }, []);

  useEffect(() => {
    let freshRequested = false;
    const queue = createLiveReadQueue({
      read: (signal) => {
        const fresh = freshRequested;
        freshRequested = false;
        return readNotificationStatus(signal, fresh);
      },
      onData: (value) => {
        hasLiveResult.current = true;
        setStatus(value);
      },
      onError: (error) => {
        if (error instanceof NotificationReadError && error.isDenied) {
          hasLiveResult.current = true;
          setStatus({
            applications: { status: "denied" },
            catalog: { status: "denied" },
          });
        } else
          setStatus(
            (previous) =>
              previous ?? {
                applications: { status: "unavailable" },
                catalog: { status: "unavailable" },
              },
          );
      },
      shouldRetry: (error) =>
        !(error instanceof NotificationReadError && error.isDenied),
    });
    const subscriptions = ["applications-changed", "catalog-changed"] as const;
    const unsubscribers = subscriptions.map((eventName) =>
      notifications?.subscribe({
        eventName,
        onReady: queue.request,
        onChanged: queue.request,
        onUnavailable: () => {},
      }),
    );
    function visibilityChanged() {
      if (document.visibilityState !== "visible") queue.pause();
      else queue.request();
    }
    function reviewed() {
      freshRequested = true;
      if (document.visibilityState === "visible") queue.request();
    }
    window.addEventListener(PENDING_APPLICATIONS_CHANGED, reviewed);
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe?.();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener(PENDING_APPLICATIONS_CHANGED, reviewed);
      queue.dispose();
    };
  }, [notifications]);

  return (
    <SeedContext.Provider value={seed}>
      <PendingContext.Provider value={status}>
        {children}
      </PendingContext.Provider>
    </SeedContext.Provider>
  );
}

export function PendingApplicationsSeed({
  status,
}: {
  status: AdminNotificationsResponse;
}) {
  const seed = useContext(SeedContext);
  useEffect(() => seed(status), [seed, status]);
  return null;
}

export function PendingApplicationsIndicator({
  topic = "applications",
}: {
  topic?: keyof AdminNotificationsResponse;
}) {
  const status = useContext(PendingContext)?.[topic];
  if (
    !status ||
    status.status === "denied" ||
    (status.status === "ready" && !status.has_pending)
  )
    return null;
  const label =
    topic === "applications"
      ? "Hay solicitudes pendientes de revisión"
      : "Hay productos o cambios pendientes de revisión";
  if (status.status === "unavailable")
    return (
      <span
        title="No se pudo confirmar si hay revisiones pendientes"
        data-testid={`pending-${topic}-unknown`}
        className="text-sidebar-muted"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Estado de revisiones sin confirmar</span>
      </span>
    );
  return (
    <PendingIndicator
      label={label}
      data-testid={`pending-${topic}-indicator`}
    />
  );
}
