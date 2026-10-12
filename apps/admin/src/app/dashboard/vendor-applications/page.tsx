import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";
import LoadingVendorApplications from "./loading";

import { Button } from "@/components/ui/button";
import {
  ApplicationFilters,
  ApplicationList,
} from "@/features/vendor-applications/components/application-list";
import {
  applicationServiceError,
  listVendorApplications,
} from "@/features/vendor-applications/data";
import {
  applicationListHref,
  parseApplicationFilters,
} from "@/features/vendor-applications/helpers";

export const metadata: Metadata = {
  title: "Solicitudes de vendedores",
  description:
    "Consulta las solicitudes de vendedores y revisa su estado de aprobación en USAPEEK Admin.",
};

export default async function VendorApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseApplicationFilters(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Solicitudes de vendedores</h1>
      <ApplicationFilters filters={filters} />
      <Suspense
        key={JSON.stringify(filters)}
        fallback={<LoadingVendorApplications />}
      >
        <ApplicationQueue filters={filters} />
      </Suspense>
    </div>
  );
}

async function ApplicationQueue({
  filters,
}: {
  filters: ReturnType<typeof parseApplicationFilters>;
}) {
  let result;
  try {
    result = await listVendorApplications(filters);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <AdminAutoRefresh eventName="applications-changed">
        <div role="alert" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {applicationServiceError(error)}
          </p>
          <Button asChild variant="outline" size="sm">
            <a href={applicationListHref(filters)}>Reintentar</a>
          </Button>
        </div>
      </AdminAutoRefresh>
    );
  }
  return (
    <AdminAutoRefresh eventName="applications-changed">
      <ApplicationList filters={filters} result={result} />
    </AdminAutoRefresh>
  );
}
