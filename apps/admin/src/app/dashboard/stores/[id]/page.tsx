import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreDetailRegion } from "@/features/stores/components";
import { StoreDetailSkeleton } from "@/features/stores/store-detail";

export const metadata: Metadata = {
  title: "Detalle de tienda",
  description:
    "Revisa la información y el estado de una tienda del marketplace en USAPEEK Admin.",
};

async function StoreContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoreDetailRegion id={id} />;
}

export default function StorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/stores">
          <ArrowLeft aria-hidden="true" />
          Volver a tiendas
        </Link>
      </Button>
      <Suspense fallback={<StoreDetailSkeleton />}>
        <StoreContent params={params} />
      </Suspense>
    </div>
  );
}
