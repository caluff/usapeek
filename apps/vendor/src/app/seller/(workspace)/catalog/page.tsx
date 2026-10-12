import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogFilters } from "@/features/catalog/catalog-filters";
import {
  CatalogResults,
  CatalogListSkeleton,
} from "@/features/catalog/catalog-list";
import { catalogListInput } from "@/features/catalog/parameters";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Consulta y gestiona los productos disponibles en el catálogo de tu tienda en USAPEEK.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    status?: string | string[];
  }>;
}) {
  const input = catalogListInput(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Catálogo</h1>
      <CatalogFilters input={input} />
      <Suspense key={JSON.stringify(input)} fallback={<CatalogListSkeleton />}>
        <CatalogResults input={input} />
      </Suspense>
    </div>
  );
}
