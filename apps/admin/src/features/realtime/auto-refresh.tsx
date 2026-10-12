"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAdminNotifications } from "./admin-notifications";
import { createAdminRefreshQueue } from "./refresh-queue";
import type { AdminNotificationEvent } from "./notification-hub";

type RefreshBlockers = Set<symbol>;
const RefreshBlockerContext = createContext<RefreshBlockers | null>(null);
const BLOCKERS_CHANGED = "admin-live-refresh-blockers-changed";

/** Keep list updates queued while a confirmation or its mutation is in progress. */
export function useAdminRefreshBlocker(isBlocked: boolean) {
  const blockers = useContext(RefreshBlockerContext);
  useEffect(() => {
    if (!blockers || !isBlocked) return;
    const blocker = Symbol();
    blockers.add(blocker);
    window.dispatchEvent(new Event(BLOCKERS_CHANGED));
    return () => {
      blockers.delete(blocker);
      window.dispatchEvent(new Event(BLOCKERS_CHANGED));
    };
  }, [blockers, isBlocked]);
}

export function AdminAutoRefresh({
  eventName,
  children,
}: {
  eventName: AdminNotificationEvent;
  children: ReactNode;
}) {
  const router = useRouter();
  const notifications = useAdminNotifications();
  const [isPending, startTransition] = useTransition();
  const [blockers] = useState<RefreshBlockers>(() => new Set());
  const queueRef = useRef<ReturnType<typeof createAdminRefreshQueue> | null>(null);

  useEffect(() => {
    const queue = createAdminRefreshQueue(() =>
      startTransition(() => router.refresh()),
    );
    queueRef.current = queue;
    function updateBlocked() {
      queue.setBlocked(
        document.visibilityState !== "visible" || blockers.size > 0,
      );
    }
    updateBlocked();
    const unsubscribe = notifications?.subscribe({
      eventName,
      onReady: queue.request,
      onChanged: queue.request,
      onUnavailable: () => {},
    });
    document.addEventListener("visibilitychange", updateBlocked);
    window.addEventListener(BLOCKERS_CHANGED, updateBlocked);
    return () => {
      document.removeEventListener("visibilitychange", updateBlocked);
      window.removeEventListener(BLOCKERS_CHANGED, updateBlocked);
      unsubscribe?.();
      queue.dispose();
      queueRef.current = null;
    };
  }, [router, notifications, eventName, blockers]);

  useEffect(() => {
    if (!isPending) queueRef.current?.settled();
  }, [isPending]);

  return (
    <RefreshBlockerContext.Provider value={blockers}>
      {children}
    </RefreshBlockerContext.Provider>
  );
}
