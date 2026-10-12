import type { Metadata } from "next";
import Image from "next/image";
import type { ProductDTO } from "@mercurjs/types";
import { Suspense, type ReactNode } from "react";
import {
  DataError,
  PageHeading,
  StatusBadge,
} from "@/features/workspace/components";
import { editProductAction } from "@/features/workspace/actions";
import { productDetail, resultOf, workspace } from "@/features/workspace/data";
import { ProductChangeHistory } from "@/features/catalog/product-change-history";
import {
  CategoryFields,
  type CategoryResult,
} from "@/features/catalog/category-fields";
import { catalogCategories } from "@/features/catalog/data";
import { ProductEditSection } from "@/features/catalog/product-edit-section";
import { ProductOrganizationFields } from "@/features/catalog/product-organization-fields";
import {
  PRODUCT_MEASUREMENTS,
  PRODUCT_TEXT_ATTRIBUTES,
} from "@/features/catalog/product-specifications";
import { CreateVariantContent } from "@/features/catalog/create-variant-content";
import { ProductOffers } from "@/features/offers/product-offers";
import { ProductVariantsCard } from "@/features/offers/product-variants-card";
import { offerConfiguration } from "@/features/offers/data";
import { PresentationControls } from "@/features/catalog/presentation-controls";
import { hasPresentationOptions } from "@/features/catalog/variant-options";
import { CatalogAutoRefresh } from "@/features/catalog/auto-refresh";
import { ProductDescription } from "@/features/catalog/product-description";

export const metadata: Metadata = {
  title: "Detalle de producto",
  description: "Consulta y actualiza la información, las variantes y la configuración de venta de un producto de tu tienda.",
};
const loading = (
  <div
    role="status"
    className="h-64 motion-safe:animate-pulse rounded-lg bg-muted p-5 text-sm text-muted-foreground"
  >
    Cargando datos…
  </div>
);
function EditSections({
  product,
  categories,
  disabled = false,
  history,
  historyOpen,
  variants,
}: {
  product: ProductDTO;
  categories: CategoryResult;
  disabled?: boolean;
  history: ReactNode;
  historyOpen: boolean;
  variants: ReactNode;
}) {
  const showProductAttributes =
    hasPresentationOptions(product) ||
    [...PRODUCT_TEXT_ATTRIBUTES, ...PRODUCT_MEASUREMENTS].some(
      ({ name }) => product[name] != null && product[name] !== "",
    );
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <div className="min-w-0 space-y-6">
        <ProductEditSection
          title={product.title}
          history={history}
          historyOpen={historyOpen}
          status={<StatusBadge status={product.status} />}
          product={product}
          section="details"
          action={editProductAction}
          disabled={disabled}
        >
          {product.subtitle ? (
            <p className="mb-5 text-sm">{product.subtitle}</p>
          ) : null}
          <ProductDescription description={product.description} />
          <dl className="mt-5 space-y-3 border-t pt-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">URL del producto</dt>
              <dd className="max-w-[60%] text-right break-words">
                {product.handle || "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">Descuentos</dt>
              <dd>{product.discountable ? "Permitidos" : "No permitidos"}</dd>
            </div>
          </dl>
        </ProductEditSection>
        <ProductEditSection
          title="Imágenes"
          product={product}
          section="media"
          action={editProductAction}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-3">
            {product.images?.map((image) => (
              <Image
                key={image.id}
                src={image.url}
                width={120}
                height={120}
                alt={product.title}
                unoptimized
                className="size-30 border object-cover"
              />
            ))}
          </div>
        </ProductEditSection>
        {variants}
      </div>
      <div className="min-w-0 space-y-6">
        <ProductEditSection
          title="Organización"
          product={product}
          section="organization"
          action={editProductAction}
          disabled={disabled}
          organization={<ProductOrganizationFields product={product} />}
          categories={
            <Suspense
              fallback={
                <p role="status" className="h-24 text-sm text-muted-foreground">
                  Cargando categorías…
                </p>
              }
            >
              <CategoryFields
                categories={categories}
                selected={product.categories?.map((category) => category.id)}
              />
            </Suspense>
          }
        >
          <dl className="space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="max-w-[60%] text-right break-words">
                {product.type?.value || "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">Colección</dt>
              <dd className="max-w-[60%] text-right break-words">
                {product.collection?.title || "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">Categorías</dt>
              <dd className="max-w-[60%] text-right break-words">
                {product.categories?.map(({ name }) => name).join(", ") || "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">Etiquetas</dt>
              <dd className="max-w-[60%] text-right break-words">
                {product.tags?.map(({ value }) => value).join(", ") || "-"}
              </dd>
            </div>
          </dl>
        </ProductEditSection>
        {showProductAttributes ? (
          <ProductEditSection
            title="Atributos generales del producto"
            product={product}
            section="attributes"
            action={editProductAction}
            disabled={disabled}
          >
            <p className="mb-4 text-sm text-muted-foreground">
              Son independientes de los atributos de cada variante.
            </p>
            <dl className="space-y-4 text-sm">
              {[
                { name: "material" as const, label: "Material" },
                ...PRODUCT_MEASUREMENTS,
                { name: "origin_country" as const, label: "País de origen" },
                { name: "hs_code" as const, label: "Código HS" },
                { name: "mid_code" as const, label: "Código MID" },
              ].map(({ name, label }) => (
                <div
                  key={name}
                  className="flex items-start justify-between gap-4"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="max-w-[60%] text-right break-words">
                    {product[name] == null || product[name] === ""
                      ? "-"
                      : String(product[name])}
                  </dd>
                </div>
              ))}
            </dl>
          </ProductEditSection>
        ) : null}
      </div>
    </div>
  );
}
async function ProductContent({
  id,
  searchParams,
}: {
  id: string;
  searchParams: Promise<{ history?: string }>;
}) {
  const { client, membership } = await workspace();
  // Handle an early category failure even when product detail fails or editing is pending.
  const categories = resultOf(catalogCategories(client));
  const configuration = resultOf(offerConfiguration(client));
  const [result, query] = await Promise.all([
    resultOf(productDetail(id)),
    searchParams,
  ]);
  if (!result.data)
    return (
      <>
        <CatalogAutoRefresh sellerId={membership.seller.id} />
        <DataError message={result.error} />
      </>
    );
  const { product } = result.data;
  const changes = (product.changes ?? []).filter(
    (change) => change.created_by === membership.seller.id,
  );
  const hasPending = changes.some((change) => change.status === "pending");
  const hasOptions = hasPresentationOptions(product);
  return (
    <>
      <CatalogAutoRefresh sellerId={membership.seller.id} />
      {hasPending ? (
        <p className="text-sm text-muted-foreground">
          Ya hay una solicitud pendiente. Espera su resolución para guardar
          otros cambios.
        </p>
      ) : null}
      <EditSections
        product={product}
        categories={categories}
        disabled={hasPending}
        history={<ProductChangeHistory changes={changes} />}
        historyOpen={query.history === "1"}
        variants={
          <ProductVariantsCard
            createAction={
              hasOptions ? (
                <PresentationControls hasPending={hasPending}>
                  <Suspense
                    fallback={
                      <p
                        role="status"
                        className="h-32 text-sm text-muted-foreground"
                      >
                        Cargando configuración de la variante…
                      </p>
                    }
                  >
                    <CreateVariantContent
                      product={product}
                      configuration={configuration}
                    />
                  </Suspense>
                </PresentationControls>
              ) : undefined
            }
          >
            <Suspense
              fallback={
                <div
                  role="status"
                  className="h-48 px-5 py-8 text-sm text-muted-foreground motion-safe:animate-pulse"
                >
                  Cargando variantes…
                </div>
              }
            >
              <ProductOffers
                product={product}
                configuration={configuration}
                hasPending={hasPending}
              />
            </Suspense>
          </ProductVariantsCard>
        }
      />
    </>
  );
}
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ history?: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Catálogo" title="Detalle de producto" />
      <Suspense fallback={loading}>
        <ProductContent id={id} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
