import type { Metadata } from "next";
import { Suspense } from "react";
import { SettlementList } from "@/features/settlements/list";
import { SettlementListSkeleton } from "@/features/settlements/view";
import { PageHeading } from "@/features/workspace/components";
import {
  settlementListInput,
  type SettlementSearchParams,
} from "@/features/settlements/parameters";

export const metadata: Metadata = {
  title: "Cobros pendientes",
  description: "Consulta las liquidaciones pendientes de cobro correspondientes a los pedidos de tu tienda.",
};

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<SettlementSearchParams>;
}) {
  const input = settlementListInput(await searchParams);
  return (
    <div className="space-y-6">
      <PageHeading title="Pendientes" />
      <Suspense key={input.page} fallback={<SettlementListSkeleton />}>
        <SettlementList input={input} />
      </Suspense>
    </div>
  );
}
