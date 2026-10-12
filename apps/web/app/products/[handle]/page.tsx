import type { Metadata } from "next"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { notFound } from "next/navigation"
import { ArrowLeft, ChevronRight, Heart } from "lucide-react"
import { SiteFooter } from "@/components/site-footer"
import { Skeleton } from "@/components/ui/skeleton"
import { FavoriteButton } from "@/features/account/components/favorite-button"
import { getFavoriteProductIds } from "@/features/account/favorites"
import { catalogHref } from "@/features/catalog/catalog-navigation"
import { ProductGallery } from "@/features/catalog/product-gallery"
import { ProductOffers } from "@/features/catalog/product-offers"
import { ProductDetails } from "@/features/catalog/product-details"
import { ProductSummary } from "@/features/catalog/product-summary"
import { ProductVariantSelection } from "@/features/catalog/product-variant-selection"
import { getProductImageSources } from "@/features/catalog/variant-images"
import { RelatedProducts } from "@/features/catalog/related-products"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import {
  getStorefrontProduct,
  getStorefrontRegion,
} from "@/lib/medusa"

export const dynamic = "force-dynamic"
type ProductPageProps = { params: Promise<{ handle: string }> }

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { handle } = await params
  try {
    const { product } = await getStorefrontProduct(handle)
    return product
      ? {
          title: product.title,
          description: (
            product.description?.replace(/\s+/g, " ").trim() ||
            `Consulta las características y ofertas de ${product.title} en USAPEEK.`
          ).slice(0, 160),
        }
      : {
          title: "Producto no encontrado",
          description:
            "El producto que buscas no está disponible. Explora el catálogo de USAPEEK para descubrir otras opciones.",
          robots: { index: false },
        }
  } catch {
    return {
      title: "Producto",
      description: "Consulta las características y ofertas de productos en USAPEEK.",
    }
  }
}

const PRODUCT_GRID =
  "grid items-start gap-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(17rem,0.8fr)]"

function OfferSkeleton({
  summary,
  overview,
}: {
  summary: ReactNode
  overview?: ReactNode
}) {
  return (
    <>
      <section className="min-w-0">
        {summary}
        <div
          className="my-5 space-y-3 border-y border-border py-5"
          aria-label="Cargando precio"
        >
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        {overview}
      </section>
      <div
        className="space-y-5 border border-border p-5 md:col-span-2 lg:col-span-1 lg:row-span-2"
        aria-label="Cargando disponibilidad y opciones de compra"
      >
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </>
  )
}

function ProductSkeleton() {
  return (
    <div aria-label="Cargando producto" className={PRODUCT_GRID}>
      <Skeleton className="aspect-square w-full" />
      <OfferSkeleton
        summary={
          <div className="space-y-3">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-6 w-full" />
          </div>
        }
      />
    </div>
  )
}

async function ProductFavorite({ productId }: { productId: string }) {
  let customer: Awaited<ReturnType<typeof getCurrentCustomer>>
  try {
    customer = await getCurrentCustomer()
  } catch {
    return (
      <span
        role="status"
        aria-label="Favoritos no disponibles"
        title="Favoritos no disponibles"
        className="grid size-11 shrink-0 place-items-center border border-border text-muted-foreground"
      >
        <Heart className="size-4" aria-hidden="true" />
      </span>
    )
  }
  return (
    <FavoriteButton
      productId={productId}
      saved={getFavoriteProductIds(customer?.metadata).includes(productId)}
      authenticated={Boolean(customer)}
      compact
    />
  )
}

async function ProductContent({
  params,
  regionPromise,
}: ProductPageProps & {
  regionPromise: ReturnType<typeof getStorefrontRegion>
}) {
  const { handle } = await params
  let result: Awaited<ReturnType<typeof getStorefrontProduct>>
  try {
    result = await getStorefrontProduct(handle)
  } catch {
    return (
      <div role="alert" className="border border-border p-8">
        <h1 className="text-3xl">No pudimos cargar este producto</h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Vuelve a intentar en unos instantes.
        </p>
        <Link
          href={"/products/" + encodeURIComponent(handle)}
          className="mt-6 inline-flex min-h-11 items-center font-sans underline underline-offset-4"
        >
          Reintentar
        </Link>
      </div>
    )
  }
  const { product } = result
  if (!product) notFound()
  const images = getProductImageSources(product)
  const summary = <ProductSummary product={product} />
  const overview = product.description ? (
    <p className="whitespace-pre-line break-words font-sans text-sm leading-6 text-muted-foreground">
      {product.description}
    </p>
  ) : null
  const category = product.categories?.[0]
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <nav
          aria-label="Ruta del producto"
          className="flex min-w-0 flex-wrap items-center gap-2 font-sans text-xs text-muted-foreground"
        >
          <Link href={catalogHref({})} className="hover:text-foreground">
            Productos
          </Link>
          {category ? (
            <>
              <ChevronRight className="size-3" aria-hidden="true" />
              <Link
                href={catalogHref({ categoryId: category.id })}
                className="hover:text-foreground"
              >
                {category.name}
              </Link>
            </>
          ) : null}
          <ChevronRight className="size-3" aria-hidden="true" />
          <span
            className="max-w-60 truncate text-foreground"
            aria-current="page"
          >
            {product.title}
          </span>
        </nav>
        <Suspense
          fallback={
            <Skeleton
              className="size-11 shrink-0"
              aria-label="Cargando favorito"
            />
          }
        >
          <ProductFavorite productId={product.id} />
        </Suspense>
      </div>
      <ProductVariantSelection
        key={product.id}
        variants={product.variants ?? []}
      >
        <article className={PRODUCT_GRID}>
          <ProductGallery title={product.title} sources={images} />
          <Suspense
            fallback={<OfferSkeleton summary={summary} overview={overview} />}
          >
            <ProductOffers
              product={product}
              regionPromise={regionPromise}
              summary={summary}
              overview={overview}
            />
          </Suspense>
          <div className="min-w-0 md:col-span-2">
            <ProductDetails product={product} />
          </div>
        </article>
      </ProductVariantSelection>
      <Suspense
        fallback={
          <div
            className="mt-8 border-t border-border pt-6"
            aria-label="Cargando otros productos"
          >
            <h2 className="mb-5 font-sans text-base font-bold">
              También te puede interesar
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          </div>
        }
      >
        <RelatedProducts product={product} />
      </Suspense>
    </>
  )
}

export default function ProductPage(props: ProductPageProps) {
  const regionPromise = getStorefrontRegion()
  void regionPromise.catch(() => undefined)
  return (
    <>
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-4 sm:px-6 lg:px-10 lg:py-5">
        <Link
          href={catalogHref({})}
          className="mb-1 inline-flex min-h-11 items-center gap-2 font-sans text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Volver al catálogo
        </Link>
        <Suspense fallback={<ProductSkeleton />}>
          <ProductContent {...props} regionPromise={regionPromise} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
