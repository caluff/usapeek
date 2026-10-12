"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { FinanceReportingPeriod } from "@usapeek/api/finance-contracts";
import { Button } from "@/components/ui/button";
import { useAdminNotifications } from "@/features/realtime/admin-notifications";
import { createFinanceReadQueue } from "./live-read-queue";
import {
  FinanceReportReadError,
  readLiveReport,
  reportReadFailure,
  type FinanceReportState,
} from "./live-data";
import { FinanceReportContent } from "./report-content";
import { useReportOrderImages } from "./report-order-images";

export function FinanceReportLive({
  initial,
  initialImages,
  period,
  page,
}: {
  initial: FinanceReportState;
  initialImages: Record<string, ReactNode>;
  period: FinanceReportingPeriod;
  page: number;
}) {
  const notifications = useAdminNotifications();
  const [result, setResult] = useState(initial);
  const queueRef = useRef<ReturnType<typeof createFinanceReadQueue> | null>(
    null,
  );
  const url = `/dashboard/reporting/data?period=${period}`;
  const hasInitialData = Boolean(initial.data);
  const images = useReportOrderImages(result.data?.report, page, initialImages);
  useEffect(() => {
    const queue = createFinanceReadQueue({
      read: (signal) => readLiveReport(url, signal),
      onData: (data) => setResult({ data }),
      onError: (error) =>
        setResult((previous) => reportReadFailure(previous, error)),
      shouldRetry: (error) =>
        !(error instanceof FinanceReportReadError && error.isDenied),
      retryDelayMs: (failures) => Math.min(15_000 * 2 ** failures, 60_000),
    });
    queueRef.current = queue;
    let hasObservedVisibility = false;
    function visibilityChanged() {
      // The first SSE ready verifies the SSR snapshot. Starting an additional
      // read here can overlap that verification when the report is slow.
      queue.setPaused(document.visibilityState !== "visible", {
        requestOnResume: hasObservedVisibility || !hasInitialData,
      });
      hasObservedVisibility = true;
    }
    visibilityChanged();
    const unsubscribe = notifications?.subscribe({
      eventName: "finance-reporting-changed",
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
  }, [notifications, url, hasInitialData]);
  return (
    <div className="space-y-4">
      {result.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{result.error}</p>
          {result.isDenied ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/login?reason=expired&next=%2Fdashboard">
                Volver a entrar
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => queueRef.current?.request()}
            >
              Reintentar
            </Button>
          )}
        </div>
      ) : null}
      {result.data ? (
        <FinanceReportContent
          report={result.data.report}
          period={period}
          page={page}
          images={images}
        />
      ) : null}
    </div>
  );
}
