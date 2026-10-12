import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import {
  OrderFilters,
  OrderList,
  OrderListSkeleton,
} from "@/features/orders/list-components";
import { orderListInput } from "@/features/orders/parameters";

export const metadata: Metadata = {
  title: "Pedidos",
  description: "Consulta, filtra y gestiona los pedidos asignados a tu tienda en USAPEEK.",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const input = orderListInput(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Pedidos de la tienda</h1>
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href="/seller/orders/returns">Devoluciones</Link>
        </Button>
      </div>
      <OrderFilters input={input} />
      <Suspense
        key={`${input.q}:${input.tab.value}:${input.page}`}
        fallback={<OrderListSkeleton />}
      >
        <OrderList input={input} />
      </Suspense>
    </div>
  );
}
