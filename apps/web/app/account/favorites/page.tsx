import type { Metadata } from "next"
import { Heart, PackageOpen } from "lucide-react"
import { Suspense } from "react"

import { ProductCard } from "@/components/product-card"
import { ProductGridSkeleton } from "@/components/product-grid-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { AccountHeading } from "@/features/account/components/account-heading"
import { AccountEmptyState } from "@/features/account/components/empty-state"
import { FavoriteButton } from "@/features/account/components/favorite-button"
import { AccountPagination } from "@/features/account/components/pagination"
import {
  ACCOUNT_PAGE_SIZE,
  getAccount,
  getPageNumber,
} from "@/features/account/data"
import { getFavoriteProductIds } from "@/features/account/favorites"
import { groupOffersByProduct } from "@/features/catalog/offers"
import { getStorefrontOffers, getStorefrontRegion } from "@/lib/medusa"

export const metadata: Metadata = {
  title: "Mis favoritos",
  description:
    "Vuelve a encontrar los productos que guardaste en USAPEEK, consulta sus ofertas y organiza tus próximas compras.",
}

type FavoritesPageProps = {
  searchParams: Promise<{ page?: string | string[] }>
}

export default function FavoritesPage(props: FavoritesPageProps) {
  return (
    <>
      <AccountHeading
        title="Mis favoritos"
        description="Todo eso que quieres volver a mirar. Guarda productos desde el catálogo y encuéntralos aquí cuando vuelvas."
      />
      <Suspense
        fallback={
          <div>
            <Skeleton className="mb-5 h-4 w-40" />
            <ProductGridSkeleton
              className="gap-5 sm:grid-cols-2 xl:grid-cols-3"
              count={6}
            />
          </div>
        }
      >
        <FavoriteProducts {...props} />
      </Suspense>
    </>
  )
}

async function FavoriteProducts({ searchParams }: FavoritesPageProps) {
  const requestedPage = getPageNumber((await searchParams).page)
  const { customer, sdk } = await getAccount()
  const ids = getFavoriteProductIds(customer.metadata)
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(ids.length / ACCOUNT_PAGE_SIZE)),
  )
  const pageIds = ids.slice(
    (page - 1) * ACCOUNT_PAGE_SIZE,
    page * ACCOUNT_PAGE_SIZE,
  )
  const region = pageIds.length ? await getStorefrontRegion() : null
  const [{ products }, offers] = await Promise.all([
    pageIds.length
      ? sdk.store.product.list({
          id: pageIds,
          limit: ACCOUNT_PAGE_SIZE,
          ...(region ? { region_id: region.id } : {}),
          fields:
            "id,title,subtitle,description,handle,thumbnail,*images,*categories",
        })
      : { products: [] },
    region ? getStorefrontOffers(pageIds, region.id) : [],
  ])
  const offersByProduct = groupOffersByProduct(offers)
  const productsById = new Map(products.map((product) => [product.id, product]))
  return (
    <>
      {ids.length === 0 ? (
        <AccountEmptyState
          icon={<Heart aria-hidden="true" strokeWidth={1.5} />}
          title="Tu próxima elección empieza aquí"
        >
          Toca el corazón de un producto para guardarlo en tu cuenta.
        </AccountEmptyState>
      ) : (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            {ids.length}{" "}
            {ids.length === 1 ? "producto guardado" : "productos guardados"}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {pageIds.map((id) => {
              const product = productsById.get(id)
              return product ? (
                <ProductCard
                  key={id}
                  product={product}
                  offers={offersByProduct.get(product.id)}
                  isFavorite
                  authenticated
                />
              ) : (
                <div
                  key={id}
                  className="flex min-h-64 flex-col items-center justify-center gap-5 border border-dashed border-border p-6 text-center"
                >
                  <PackageOpen
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    Este producto ya no está disponible.
                  </p>
                  <FavoriteButton productId={id} saved authenticated />
                </div>
              )
            })}
          </div>
          <AccountPagination
            page={page}
            count={ids.length}
            pageSize={ACCOUNT_PAGE_SIZE}
            href="/account/favorites"
          />
        </>
      )}
    </>
  )
}
