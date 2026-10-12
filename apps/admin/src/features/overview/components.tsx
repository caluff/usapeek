import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminReadSdk } from "@/lib/admin-read-sdk";
import { readOverviewCount, type OverviewMetricDefinition } from "./metrics";
import { LiveOverviewCount } from "./live-metric";

export function OverviewMetricSkeleton({
  metric,
}: {
  metric: OverviewMetricDefinition;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
      </CardHeader>
      <CardContent aria-label="Cargando indicador">
        <Skeleton className="mb-4 h-9 w-20" />
        <Skeleton className="h-5 w-36" />
      </CardContent>
    </Card>
  );
}

export async function OverviewMetric({
  metric,
}: {
  metric: OverviewMetricDefinition;
}) {
  let count: number | null = null;
  try {
    const sdk = await requireAdminReadSdk();
    count = await readOverviewCount(sdk, metric.id, AbortSignal.timeout(15_000));
  } catch {
    /* Each metric remains independent when a service is unavailable. */
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <LiveOverviewCount
          key={`${metric.id}:${count}`}
          id={metric.id}
          initialCount={count}
        />
        <Link
          href={metric.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          {metric.action}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
