import type { HttpTypes } from "@medusajs/types"
import {
  CircleAlert,
  Clock,
  CloudOff,
  KeyRound,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { ProductCard } from "@/components/product-card"
import { ProductGridSkeleton } from "@/components/product-grid-skeleton"
import { ProductFavoriteAction } from "@/features/account/components/product-favorite-action"
import { groupOffersByProduct } from "@/features/catalog/offers"
import {
  catalogHref,
  getCatalogPagination,
} from "@/features/catalog/catalog-navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { StorefrontCatalogResult } from "@/lib/medusa"

type CatalogSectionProps = {
  result: Promise<StorefrontCatalogResult>
  activeCategoryId: Promise<string | undefined>
  page: Promise<number>
  customer: Promise<HttpTypes.StoreCustomer | null>
}

type ErrorStatus = Exclude<
  StorefrontCatalogResult["status"],
  "products" | "empty" | "out_of_range"
>

const errorContent: Record<
  ErrorStatus,
  {
    title: string
    description: string
    Icon: typeof CircleAlert
  }
> = {
  configuration_missing: {
    title: "Falta completar la conexión",
    description:
      "El storefront necesita la dirección pública del backend y una clave publicable antes de mostrar el catálogo.",
    Icon: CircleAlert,
  },
  invalid_backend_url: {
    title: "La dirección del catálogo no es válida",
    description:
      "La URL pública debe usar HTTP o HTTPS y no puede incluir credenciales, parámetros ni fragmentos.",
    Icon: ShieldAlert,
  },
  invalid_publishable_key: {
    title: "La clave pública no tiene el formato esperado",
    description:
      "Configurá una clave publicable de Medusa que comience con pk_. Su valor nunca se muestra en esta página.",
    Icon: KeyRound,
  },
  backend_unavailable: {
    title: "El catálogo está fuera de línea",
    description:
      "El servicio rechazó la conexión. Puede estar detenido o todavía iniciándose.",
    Icon: CloudOff,
  },
  request_timeout: {
    title: "El catálogo está demorando demasiado",
    description:
      "La consulta superó el tiempo de espera. Probá otra vez en unos instantes.",
    Icon: Clock,
  },
  network_error: {
    title: "No pudimos llegar al catálogo",
    description:
      "Hubo un problema de red o de resolución de la dirección del servicio.",
    Icon: WifiOff,
  },
  key_rejected: {
    title: "La clave pública fue rechazada",
    description:
      "Medusa no autorizó esta consulta. Revisá que la clave publicable corresponda al Store API configurado.",
    Icon: KeyRound,
  },
  store_api_error: {
    title: "El catálogo respondió con un error",
    description:
      "La conexión funciona, pero el Store API no pudo completar la consulta de productos.",
    Icon: CircleAlert,
  },
}

function RetryButton({
  activeCategoryId,
  page,
}: {
  activeCategoryId?: string
  page: number
}) {
  return (
    <form action="/search" method="get">
      {activeCategoryId ? (
        <input type="hidden" name="category_id" value={activeCategoryId} />
      ) : null}
      {page > 1 ? <input type="hidden" name="page" value={page} /> : null}
      <Button type="submit" variant="outline">
        <RefreshCw aria-hidden="true" className="size-4" />
        Reintentar
      </Button>
    </form>
  )
}

export function CatalogSection(props: CatalogSectionProps) {
  return (
    <section
      id="catalog"
      aria-labelledby="catalog-title"
      className="scroll-mt-24 border-b border-border"
    >
      <div className="mx-auto w-full max-w-[90rem] px-4 pt-6 pb-14 sm:px-6 sm:pt-8 sm:pb-20 lg:px-10 lg:pb-24">
        <h2 id="catalog-title" className="sr-only">
          Catálogo de productos
        </h2>
        <Suspense fallback={<ProductGridSkeleton />}>
          <CatalogResults {...props} />
        </Suspense>
      </div>
    </section>
  )
}

async function CatalogResults(props: CatalogSectionProps) {
  const [categoryId, page] = await Promise.all([props.activeCategoryId, props.page])
  return (
    <Suspense
      key={catalogHref({ categoryId, page })}
      fallback={<ProductGridSkeleton />}
    >
      <CatalogContent {...props} />
    </Suspense>
  )
}

async function CatalogContent(props: CatalogSectionProps) {
  const [result, activeCategoryId, page] = await Promise.all([
    props.result,
    props.activeCategoryId,
    props.page,
  ])
  const activeCategory = Boolean(activeCategoryId)
  const pagination = getCatalogPagination(result, activeCategoryId)
  const offersByProduct = groupOffersByProduct(
    result.status === "products" ? result.offers : [],
  )
  return (
    <>
      {result.status === "products" ? (
        <>
          {!result.hasRegion ? (
            <p
              role="status"
              className="mb-7 border border-border bg-muted p-4 font-sans text-sm text-muted-foreground"
            >
              Los precios y las compras para Estados Unidos estarán disponibles
              cuando la tienda habilite su región en USD.
            </p>
          ) : null}
          {activeCategory ? (
            <div className="mb-7 flex justify-end">
              <Button asChild variant="ghost" size="sm">
                <Link href="/search">Quitar filtro</Link>
              </Button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {result.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                offers={offersByProduct.get(product.id)}
                favoriteAction={
                  <ProductFavoriteAction
                    customer={props.customer}
                    productId={product.id}
                  />
                }
              />
            ))}
          </div>
          {pagination && pagination.lastPage > 1 ? (
            <nav
              aria-label="Páginas del catálogo"
              className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
            >
              {pagination.previousHref ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link href={pagination.previousHref}>Anterior</Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-sm tabular-nums text-muted-foreground">
                Página {result.page} de {pagination.lastPage}
              </span>
              {pagination.nextHref ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link href={pagination.nextHref}>Siguiente</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : null}

      {result.status === "empty" ? (
        <Card className="mx-auto max-w-2xl bg-background text-center">
          <CardHeader className="items-center px-6 py-12 sm:px-12 sm:py-16">
            <PackageOpen
              aria-hidden="true"
              className="size-12 text-brand-accent-text"
              strokeWidth={1.25}
            />
            <CardTitle className="mt-3 text-3xl">
              {activeCategory
                ? "Esta categoría todavía está vacía"
                : "El catálogo todavía está vacío"}
            </CardTitle>
            <CardDescription className="max-w-md text-base">
              {activeCategory
                ? "Volvé al catálogo completo para seguir explorando."
                : "La conexión está lista. Los productos aparecerán acá cuando se publiquen en Medusa."}
            </CardDescription>
            {activeCategory ? (
              <Button asChild variant="accent" className="mt-4">
                <Link href="/search">Ver todo el catálogo</Link>
              </Button>
            ) : null}
          </CardHeader>
        </Card>
      ) : null}

      {result.status === "out_of_range" && pagination ? (
        <Card className="mx-auto max-w-2xl bg-background text-center">
          <CardHeader className="items-center px-6 py-12 sm:px-12">
            <CardTitle className="text-3xl">
              Esta página del catálogo no está disponible
            </CardTitle>
            <CardDescription className="max-w-md text-base">
              Volvé a la última página disponible para seguir explorando.
            </CardDescription>
            <Button asChild variant="outline" className="mt-4 min-h-11">
              <Link href={pagination.recoveryHref}>
                Ir a la página {pagination.lastPage}
              </Link>
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      {result.status !== "products" &&
      result.status !== "empty" &&
      result.status !== "out_of_range" ? (
        <Card className="mx-auto max-w-2xl bg-background">
          <CardHeader className="px-6 py-10 sm:px-10 sm:py-12">
            {(() => {
              const content = errorContent[result.status]
              const Icon = content.Icon

              return (
                <>
                  <Icon
                    aria-hidden="true"
                    className="size-11 text-brand-accent-text"
                    strokeWidth={1.25}
                  />
                  <CardTitle className="mt-3 text-3xl">
                    {content.title}
                  </CardTitle>
                  <CardDescription className="max-w-xl text-base">
                    {content.description}
                  </CardDescription>
                  <div className="mt-5">
                    <RetryButton activeCategoryId={activeCategoryId} page={page} />
                  </div>
                </>
              )
            })()}
          </CardHeader>
        </Card>
      ) : null}
    </>
  )
}
