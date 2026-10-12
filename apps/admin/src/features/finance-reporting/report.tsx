import { FetchError } from "@medusajs/js-sdk";
import type { FinanceReportingPeriod } from "@usapeek/api/finance-contracts";
import { Suspense, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminReadSdk } from "@/lib/admin-read-sdk";
import {
  loadReportOrderImages,
  ReportOrderImages,
} from "@/features/orders/order-images";
import { FinanceReportLive } from "./report-live";
import { primaryMetrics } from "./report-content";
import { financeReportQuery, REPORT_PAGE_SIZE } from "./parameters";
import { readFinanceReport } from "./read-report";
import {
  FinanceReportReadError,
  reportReadFailure,
  type FinanceReportState,
} from "./live-data";

export async function FinanceReport({
  period,
  page,
}: {
  period: FinanceReportingPeriod;
  page: number;
}) {
  let initial: FinanceReportState = {};
  try {
    const sdk = await requireAdminReadSdk();
    initial = {
      data: await readFinanceReport(sdk, financeReportQuery(period)),
    };
  } catch (error) {
    unstable_rethrow(error);
    initial = reportReadFailure(
      {},
      error instanceof FetchError
        ? new FinanceReportReadError(error.status ?? 503)
        : error,
    );
  }
  const images: Record<string, ReactNode> = {};
  if (initial.data) {
    const report = initial.data.report;
    const lastPage = Math.max(
      1,
      Math.ceil(report.sales.length / REPORT_PAGE_SIZE),
    );
    const currentPage = Math.min(page, lastPage);
    const sales = report.sales.slice(
      (currentPage - 1) * REPORT_PAGE_SIZE,
      currentPage * REPORT_PAGE_SIZE,
    );
    if (sales.length) {
      const data = loadReportOrderImages(sales.map((sale) => sale.order_id));
      for (const sale of sales)
        images[sale.order_id] = (
          <Suspense fallback={<Skeleton className="h-12 w-40 rounded-md" />}>
            <ReportOrderImages id={sale.order_id} data={data} />
          </Suspense>
        );
    }
  }
  return (
    <FinanceReportLive
      key={`${period}:${page}`}
      initial={initial}
      initialImages={images}
      period={period}
      page={page}
    />
  );
}

export function FinanceReportSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Cargando informe financiero"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(primaryMetrics).map(([key, label]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle asChild className="text-sm font-medium">
                <h3>{label}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28" />
              <Skeleton className="mt-2 h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex min-h-14 flex-wrap items-center gap-x-8 gap-y-3 border-b pb-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-5 w-52" />
      <div className="space-y-2 py-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
