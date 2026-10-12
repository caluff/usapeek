import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeading } from "@/features/workspace/components";
import {
  PaidSettlementsRegion,
  PaidSettlementsToolbar,
} from "@/features/settlements/paid-list";
import { Skeleton } from "@/components/ui/skeleton";
import { PaidSettlementListSkeleton } from "@/features/settlements/paid-view";
import type { PaidSettlementSearchParams } from "@/features/settlements/paid-parameters";

export const metadata: Metadata = {
  title: "Cobros realizados",
  description: "Revisa el historial de liquidaciones cobradas de tu tienda y filtra los resultados por período.",
};

export default function PaidSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<PaidSettlementSearchParams>;
}) {
  return (
    <div className="space-y-6">
      <PageHeading title="Cobrados">
        <div className="ml-auto">
          <Suspense
            fallback={
              <Skeleton
                className="h-8 w-44"
                aria-label="Cargando filtro de período"
              />
            }
          >
            <PaidSettlementsToolbar searchParams={searchParams} />
          </Suspense>
        </div>
      </PageHeading>
      <Suspense fallback={<PaidSettlementListSkeleton />}>
        <PaidSettlementsRegion searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
