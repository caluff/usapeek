import type { Metadata } from "next";
import { FetchError } from "@medusajs/js-sdk";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductReviewDetail } from "@/features/product-review/components/product-detail";
import { retrieveProductForReview } from "@/features/product-review/data";
import { isProductReviewId } from "@/features/product-review/helpers";

export const metadata: Metadata = {
  title: "Revisar producto",
  description:
    "Revisa la información de un producto y resuelve sus cambios pendientes en USAPEEK Admin.",
};

async function ProductContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isProductReviewId(id)) notFound();
  let result;
  try {
    result = await retrieveProductForReview(id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    throw error;
  }
  return <ProductReviewDetail {...result} />;
}

export default function ProductReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/product-review">← Volver al catálogo</Link>
      </Button>
      <Suspense
        fallback={
          <Skeleton className="h-96 w-full" aria-label="Cargando producto" />
        }
      >
        <ProductContent params={params} />
      </Suspense>
    </div>
  );
}
