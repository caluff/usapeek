import type { Metadata } from "next";
import { Suspense } from "react";
import {
  OverviewMetric,
  OverviewMetricSkeleton,
} from "@/features/overview/components";
import { OVERVIEW_METRICS } from "@/features/overview/metrics";
import {
  FinanceReport,
  FinanceReportSkeleton,
} from "@/features/finance-reporting/report";
import { OverviewReportToolbar } from "@/features/overview/report-toolbar";
import { parseOverviewReportFilters } from "@/features/overview/report-filters";

export const metadata: Metadata = {
  title: "Resumen",
  description:
    "Consulta los indicadores de actividad y el informe financiero del marketplace en USAPEEK Admin.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; page?: string }>;
}) {
  const { period, page } = parseOverviewReportFilters(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Resumen
      </h1>
      <section
        aria-label="Indicadores del marketplace"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {OVERVIEW_METRICS.map((metric) => (
          <Suspense
            key={metric.id}
            fallback={<OverviewMetricSkeleton metric={metric} />}
          >
            <OverviewMetric metric={metric} />
          </Suspense>
        ))}
      </section>
      <section className="space-y-4" aria-labelledby="finance-report-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="finance-report-title" className="text-xl font-semibold">
            Informe financiero
          </h2>
          <OverviewReportToolbar period={period} />
        </div>
        <Suspense
          key={`${period}:${page}`}
          fallback={<FinanceReportSkeleton />}
        >
          <FinanceReport period={period} page={page} />
        </Suspense>
      </section>
    </div>
  );
}
