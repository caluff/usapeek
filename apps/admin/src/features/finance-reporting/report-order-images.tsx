"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AdminFinanceReportingResponse } from "@usapeek/api/finance-contracts";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { REPORT_PAGE_SIZE } from "./parameters";
import type { ReportOrderImageData } from "./order-image-data";

export function useReportOrderImages(
  report: AdminFinanceReportingResponse["report"] | undefined,
  page: number,
  initial: Record<string, ReactNode>,
) {
  const [loaded, setLoaded] = useState<ReportOrderImageData>({});
  const [failed, setFailed] = useState<string[]>([]);
  const lastPage = Math.max(
    1,
    Math.ceil((report?.sales.length ?? 0) / REPORT_PAGE_SIZE),
  );
  const currentPage = Math.min(page, lastPage);
  const ids = (report?.sales ?? [])
    .slice((currentPage - 1) * REPORT_PAGE_SIZE, currentPage * REPORT_PAGE_SIZE)
    .map((sale) => sale.order_id);
  const missingKey = ids.filter((id) => !initial[id] && !loaded[id]).join("|");
  useEffect(() => {
    if (!missingKey) return;
    const missing = missingKey.split("|");
    let controller: AbortController | undefined;
    let disposed = false;
    async function load() {
      if (document.visibilityState !== "visible" || controller || disposed)
        return;
      const current = new AbortController();
      controller = current;
      try {
        const search = new URLSearchParams();
        missing.forEach((id) => search.append("id", id));
        const response = await fetch(
          `/dashboard/reporting/order-images?${search}`,
          { cache: "no-store", signal: current.signal },
        );
        if (!response.ok) throw new Error("Order images unavailable");
        const data: ReportOrderImageData = await response.json();
        if (!disposed && !current.signal.aborted)
          setLoaded((previous) => ({
            ...previous,
            ...Object.fromEntries(
              missing.map((id) => [
                id,
                data[id] ?? { images: [], additional: 0 },
              ]),
            ),
          }));
      } catch {
        if (!disposed && !current.signal.aborted) setFailed(missing);
      } finally {
        controller = undefined;
        if (
          !disposed &&
          current.signal.aborted &&
          document.visibilityState === "visible"
        )
          void load();
      }
    }
    function visibilityChanged() {
      if (document.visibilityState === "visible") void load();
      else controller?.abort();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      disposed = true;
      controller?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [missingKey]);
  return Object.fromEntries(
    ids.map((id) => [
      id,
      loaded[id] ? (
        <ReportOrderThumbnails data={loaded[id]} />
      ) : (
        (initial[id] ??
        (failed.includes(id) ? (
          <ProductThumbnail />
        ) : (
          <Skeleton className="h-12 w-40 rounded-md" />
        )))
      ),
    ]),
  );
}

function ReportOrderThumbnails({
  data,
}: {
  data: ReportOrderImageData[string];
}) {
  return (
    <div className="flex items-center gap-1.5">
      {data.images.length ? (
        data.images.map((image, index) => (
          <ProductThumbnail key={index} src={image.src} alt={image.alt} />
        ))
      ) : (
        <ProductThumbnail />
      )}
      {data.additional > 0 ? (
        <span
          className="px-1 text-xs text-muted-foreground"
          title={`${data.additional} productos más`}
        >
          +{data.additional}
        </span>
      ) : null}
    </div>
  );
}
