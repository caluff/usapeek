import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import {
  OrderFilters,
  OrderListSkeleton,
  OrderResults,
} from "@/features/orders/components";
import { parseOrderFilters } from "@/features/orders/helpers";

export const metadata: Metadata = {
  title: "Pedidos",
  description:
    "Consulta y filtra los pedidos del marketplace para gestionar su seguimiento en USAPEEK Admin.",
};
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseOrderFilters(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Pedidos</h1>
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/orders/returns">Devoluciones</Link>
        </Button>
      </div>
      <OrderFilters filters={filters} />
      <Suspense key={JSON.stringify(filters)} fallback={<OrderListSkeleton />}>
        <OrderResults filters={filters} />
      </Suspense>
    </div>
  );
}
