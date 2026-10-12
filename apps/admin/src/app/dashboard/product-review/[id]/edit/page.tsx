import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { FetchError } from "@medusajs/js-sdk";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";
import { isProductReviewId } from "@/features/product-review/helpers";
import { productUpdatedAt } from "@/features/product-review/management";
import { readManagedProduct } from "@/features/product-review/management-operations";
import { ProductEditForm } from "@/features/product-review/components/product-edit-form";

export const metadata: Metadata = {
  title: "Editar producto",
  description:
    "Actualiza la información de un producto del catálogo desde USAPEEK Admin.",
};

async function ProductEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isProductReviewId(id)) notFound();
  let result;
  try {
    result = await readManagedProduct(await requireAdminSdk(), id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    throw error;
  }
  const { product, hasPendingChange } = result;
  return (
    <AdminAutoRefresh eventName="catalog-changed">
      <Card>
        <CardContent className="pt-6">
          {hasPendingChange ? (
            <div className="space-y-4">
              <p>
                Resuelve los cambios pendientes del vendedor antes de editar
                este producto.
              </p>
              <Button asChild>
                <Link
                  href={`/dashboard/product-review/${encodeURIComponent(id)}`}
                >
                  Revisar cambios
                </Link>
              </Button>
            </div>
          ) : (
            <ProductEditForm
              key={productUpdatedAt(product.updated_at)}
              product={{
                id: product.id,
                title: product.title,
                subtitle: product.subtitle,
                description: product.description,
              }}
              updatedAt={productUpdatedAt(product.updated_at)}
            />
          )}
        </CardContent>
      </Card>
    </AdminAutoRefresh>
  );
}

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/product-review?status=all">
          Volver al catálogo
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Editar producto</h1>
      <Suspense
        fallback={
          <Skeleton className="h-96 w-full" aria-label="Cargando producto" />
        }
      >
        <ProductEditor params={params} />
      </Suspense>
    </div>
  );
}
