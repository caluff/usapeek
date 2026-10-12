import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/features/workspace/components";
import { resultOf, workspace } from "@/features/workspace/data";
import { sellerWarehouse } from "@/features/inventory/data";
import { WarehouseCard } from "@/features/inventory/warehouse-card";
import { InventoryResults } from "@/features/inventory/inventory-results";

export const metadata: Metadata = {
  title: "Inventario",
  description: "Consulta y administra las existencias de los artículos de inventario vinculados a tu tienda.",
};
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { client } = await workspace();
  const warehouse = resultOf(sellerWarehouse(client));
  return (
    <div className="space-y-6">
      <PageHeading title="Inventario">
        <Button asChild variant="outline">
          <Link href="/seller/inventory/locations">Ver almacén</Link>
        </Button>
      </PageHeading>
      <Suspense fallback={<Skeleton className="h-5 w-64" />}>
        <WarehouseCard result={warehouse} compact />
      </Suspense>
      <Suspense fallback={null}>
        <InventoryResults
          client={client}
          searchParams={searchParams}
          warehouse={warehouse}
        />
      </Suspense>
    </div>
  );
}
