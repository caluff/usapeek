import type { Metadata } from "next";
import { Suspense } from "react";
import {
  StoreFilters,
  StoreRegionSkeleton,
  StoreResults,
} from "@/features/stores/components";
import { parseStoreFilters } from "@/features/stores/helpers";

export const metadata: Metadata = {
  title: "Tiendas",
  description:
    "Consulta y filtra las tiendas del marketplace para gestionar su estado en USAPEEK Admin.",
};

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseStoreFilters(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Tiendas</h1>
      <StoreFilters filters={filters} />
      <Suspense
        key={JSON.stringify(filters)}
        fallback={<StoreRegionSkeleton />}
      >
        <StoreResults filters={filters} />
      </Suspense>
    </div>
  );
}
