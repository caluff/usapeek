"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSellerNotifications } from "../workspace/seller-notifications";
import { useHasUnsavedChanges } from "../workspace/unsaved-changes";
import { createCatalogRefreshQueue } from "./refresh-queue";

export function CatalogAutoRefresh({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const notifications = useSellerNotifications(sellerId);
  const [isPending, startTransition] = useTransition();
  const hasChanges = useHasUnsavedChanges();
  const hasChangesRef = useRef(hasChanges);
  const queueRef = useRef<ReturnType<typeof createCatalogRefreshQueue> | null>(
    null,
  );

  useEffect(() => {
    const queue = createCatalogRefreshQueue(() =>
      startTransition(() => router.refresh()),
    );
    queueRef.current = queue;
    const unsubscribe = notifications?.subscribe({
      eventName: "catalog-changed",
      onReady: queue.request,
      onChanged: queue.request,
      onUnavailable: () => {},
    });
    function visibilityChanged() {
      const visible = document.visibilityState === "visible";
      queue.setBlocked(!visible || hasChangesRef.current);
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      unsubscribe?.();
      queue.dispose();
      queueRef.current = null;
    };
  }, [router, notifications]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
    queueRef.current?.setBlocked(
      hasChanges || document.visibilityState !== "visible",
    );
  }, [hasChanges]);

  useEffect(() => {
    if (!isPending) queueRef.current?.settled();
  }, [isPending]);

  return null;
}
