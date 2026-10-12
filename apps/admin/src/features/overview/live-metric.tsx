"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminNotifications } from "@/features/realtime/admin-notifications";
import { createLiveReadQueue } from "@/features/realtime/live-read-queue";
import { OverviewCountReadError, readLiveOverviewCount } from "./read-count";
import type { OverviewMetricDefinition } from "./metrics";

const METRIC_EVENTS = {
  applications: "applications-changed",
  products: "catalog-changed",
  stores: "stores-changed",
  orders: "orders-changed",
} as const;

export function LiveOverviewCount({
  id,
  initialCount,
}: {
  id: OverviewMetricDefinition["id"];
  initialCount: number | null;
}) {
  const notifications = useAdminNotifications();
  const [count, setCount] = useState(initialCount);
  const [hasError, setHasError] = useState(initialCount === null);
  const [isDenied, setIsDenied] = useState(false);
  const queueRef = useRef<{ request: () => void } | null>(null);

  useEffect(() => {
    const queue = createLiveReadQueue({
      read: async (signal) => {
        const result = await readLiveOverviewCount(id, AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
        if (result.count === null) throw new OverviewCountReadError(result.isDenied);
        return result.count;
      },
      onData: (nextCount) => {
        setCount(nextCount);
        setHasError(false);
        setIsDenied(false);
      },
      onError: (error) => {
        const denied = error instanceof OverviewCountReadError && error.isDenied;
        setHasError(true);
        setIsDenied(denied);
        if (denied) setCount(null);
      },
      shouldRetry: (error) => !(error instanceof OverviewCountReadError && error.isDenied),
    });
    queueRef.current = queue;
    function visibilityChanged() {
      const isVisible = document.visibilityState === "visible";
      if (isVisible) queue.request();
      else queue.pause();
    }
    visibilityChanged();
    const unsubscribe = notifications?.subscribe({
      eventName: METRIC_EVENTS[id],
      onReady: queue.request,
      onChanged: queue.request,
      onUnavailable: () => {},
    });
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visibilityChanged);
      queue.dispose();
      queueRef.current = null;
    };
  }, [id, notifications]);

  return (
    <div className="mb-4">
      {count !== null && (
        <p className="text-3xl font-semibold tabular-nums">
          {count.toLocaleString("es-UY")}
        </p>
      )}
      {hasError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-muted-foreground">
            {isDenied ? "No tienes acceso a este indicador." : `No pudimos ${count === null ? "cargar" : "actualizar"} este indicador.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queueRef.current?.request()}
          >
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}
