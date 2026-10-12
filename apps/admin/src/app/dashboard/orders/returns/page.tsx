import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  ReturnQueueRegion,
  ReturnQueueSkeleton,
} from "@/features/orders/return-queue-components";
import { returnQueueInput } from "@/features/orders/return-queue";

export const metadata: Metadata = {
  title: "Devoluciones pendientes",
  description:
    "Revisa las solicitudes de devolución pendientes y gestiona su resolución en USAPEEK Admin.",
};

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = returnQueueInput(await searchParams);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Devoluciones pendientes
        </h1>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/orders">Ver pedidos</Link>
        </Button>
      </div>
      <Suspense key={input.offset} fallback={<ReturnQueueSkeleton />}>
        <ReturnQueueRegion input={input} />
      </Suspense>
    </div>
  );
}
