import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PageHeading } from "@/features/workspace/components";
import { createProductAction } from "@/features/workspace/actions";
import { workspace } from "@/features/workspace/data";
import { CategoryFields } from "@/features/catalog/category-fields";
import { ProductForm } from "@/features/catalog/product-form";
import { ProductCommercialConfiguration } from "@/features/catalog/product-commercial-configuration";
import { ProductOrganizationFields } from "@/features/catalog/product-organization-fields";

export const metadata: Metadata = {
  title: "Crear producto",
  description: "Añade un producto al catálogo de tu tienda y configura sus datos, categorías y condiciones de venta.",
};

export default async function NewProductPage() {
  await workspace();
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeading eyebrow="Catálogo" title="Crear producto" />
      <Card className="gap-0 py-0">
        <ProductForm
          commercialConfiguration={
            <Suspense
              fallback={
                <p role="status" className="h-20 text-sm text-muted-foreground">
                  Cargando configuración de venta…
                </p>
              }
            >
              <ProductCommercialConfiguration />
            </Suspense>
          }
          action={createProductAction}
          organization={<ProductOrganizationFields />}
          categories={
            <Suspense
              fallback={
                <p role="status" className="h-24 text-sm text-muted-foreground">
                  Cargando categorías…
                </p>
              }
            >
              <CategoryFields />
            </Suspense>
          }
        />
      </Card>
    </div>
  );
}
