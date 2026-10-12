import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { FavoriteButton } from "@/features/account/components/favorite-button"
import { getProductImage } from "@/features/catalog/image"
import { ProductCardImages } from "@/features/catalog/product-card-images"
import { getProductImageSources } from "@/features/catalog/variant-images"
import {
  formatPrice,
  getLowestOfferPrice,
  type StorefrontOffer,
} from "@/features/catalog/offers"

type ProductCardProps = {
  product: HttpTypes.StoreProduct
  isFavorite?: boolean
  authenticated?: boolean
  favoriteAction?: ReactNode
  offers?: StorefrontOffer[]
}

export function ProductCard({
  product,
  isFavorite = false,
  authenticated = false,
  favoriteAction,
  offers = [],
}: ProductCardProps) {
  const image = getProductImage(product.thumbnail ?? product.images?.[0]?.url)
  const generalSources = getProductImageSources(product)
  const sources = generalSources.length
    ? generalSources
    : image
      ? [image.source]
      : []
  const price = getLowestOfferPrice(offers)
  const href = `/products/${encodeURIComponent(product.handle ?? product.id)}`
  const category = product.categories?.[0]
  const isSale =
    price?.originalAmount !== null &&
    price?.originalAmount !== undefined &&
    price.originalAmount > price.amount

  return (
    <Card className="group h-full gap-0 overflow-hidden bg-background transition-transform duration-300 hover:-translate-y-1">
      <article className="flex h-full flex-col">
        <div className="relative aspect-[4/5] overflow-hidden border-b border-border bg-muted">
          <ProductCardImages
            key={JSON.stringify(sources)}
            title={product.title}
            href={href}
            sources={sources}
          />
          {isSale ? (
            <Badge variant="accent" className="absolute bottom-3 left-3">
              Oferta
            </Badge>
          ) : null}
          <div className="absolute top-3 right-3">
            {favoriteAction ?? (
              <FavoriteButton
                productId={product.id}
                saved={isFavorite}
                authenticated={authenticated}
                compact
              />
            )}
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col px-4 py-5 sm:px-5">
          {category ? (
            <p className="font-sans text-[0.68rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {category.name}
            </p>
          ) : null}
          <h3 className="mt-2 line-clamp-2 text-xl leading-tight sm:text-2xl">
            <Link
              href={href}
              className="outline-none hover:text-brand-accent-text focus-visible:ring-3 focus-visible:ring-ring"
            >
              {product.title}
            </Link>
          </h3>
          {product.subtitle || product.description ? (
            <p className="mt-3 line-clamp-2 font-sans text-sm leading-6 text-muted-foreground">
              {product.subtitle ?? product.description}
            </p>
          ) : null}

          <div className="mt-auto flex items-end justify-between gap-3 pt-6">
            <div>
              <p className="font-sans text-[0.65rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                {offers.length > 1 ? "Desde" : "Precio"}
              </p>
              {price ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-2 font-sans">
                  <span className="text-base font-black">
                    {formatPrice(price.amount, price.currencyCode)}
                  </span>
                  {isSale && price.originalAmount !== null ? (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(price.originalAmount, price.currencyCode)}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 font-sans text-sm font-semibold text-muted-foreground">
                  Precio no disponible en USD
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </article>
    </Card>
  )
}
