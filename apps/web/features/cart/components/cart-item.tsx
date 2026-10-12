import type { HttpTypes } from "@medusajs/types"
import type { OfferDTO } from "@mercurjs/types"
import { ImageIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { getProductImage } from "@/features/catalog/image"
import type { StorefrontOffer } from "@/features/catalog/offers"
import { cartItemAvailability, formatMoney } from "../presentation"
import { getCartItemVariantDescription } from "../variant-description"
import { CartItemQuantity } from "./cart-item-quantity"

type CartLineItemWithOffer = HttpTypes.StoreCartLineItem & {
  offer?: Pick<OfferDTO, "id" | "seller">
}

async function CartItemQuantityRegion({
  item,
  title,
  offers,
}: {
  item: CartLineItemWithOffer
  title: string
  offers: Promise<StorefrontOffer[]>
}) {
  const availableOffers = await offers
  const metadataOfferId = item.metadata?.offer_id
  const offerId =
    item.offer?.id ??
    (typeof metadataOfferId === "string" ? metadataOfferId : undefined)
  const offer = availableOffers.find((candidate) => candidate.id === offerId)

  return (
    <CartItemQuantity
      itemId={item.id}
      productTitle={title}
      quantity={item.quantity}
      {...cartItemAvailability(offer)}
    />
  )
}

function CartItemQuantitySkeleton() {
  return (
    <div
      className="mt-4 ml-auto w-fit font-sans sm:mt-auto"
      aria-label="Cargando disponibilidad"
    >
      <div className="mb-2 ml-auto h-3 w-32 animate-pulse bg-muted" />
      <div className="h-11 w-36 animate-pulse border border-border bg-muted" />
    </div>
  )
}

function sellerInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")

  return initials.toUpperCase() || "T"
}

export function CartItem({
  item,
  currency,
  offers,
}: {
  item: CartLineItemWithOffer
  currency: string
  offers: Promise<StorefrontOffer[]>
}) {
  const title = item.product_title ?? item.title
  const productHref = item.product_handle
    ? `/products/${encodeURIComponent(item.product_handle)}`
    : null
  const productImage = getProductImage(
    item.thumbnail ??
      item.variant?.thumbnail ??
      item.product?.thumbnail ??
      item.product?.images?.[0]?.url ??
      item.variant?.product?.thumbnail ??
      item.variant?.product?.images?.[0]?.url,
  )
  const variant = getCartItemVariantDescription(item)
  const seller = item.offer?.seller
  const sellerName = seller?.name ?? "Tienda del marketplace"
  const sellerLogo = getProductImage(seller?.logo)

  return (
    <article className="border-b border-border py-7 first:pt-0 sm:py-8">
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
        <div className="relative aspect-[4/5] overflow-hidden border border-border bg-muted">
          {productImage ? (
            productHref ? (
              <Link
                href={productHref}
                aria-label={`Ver ${title}`}
                className="absolute inset-0 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <Image
                  src={productImage.source}
                  alt={title}
                  fill
                  sizes="(max-width: 640px) 112px, 160px"
                  loading="lazy"
                  unoptimized={productImage.unoptimized}
                  className="object-cover transition-transform duration-300 hover:scale-[1.025]"
                />
              </Link>
            ) : (
              <Image
                src={productImage.source}
                alt={title}
                fill
                sizes="(max-width: 640px) 112px, 160px"
                loading="lazy"
                unoptimized={productImage.unoptimized}
                className="object-cover"
              />
            )
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <ImageIcon
                className="size-8"
                strokeWidth={1.25}
                aria-hidden="true"
              />
              <span className="sr-only">Este producto no tiene imagen</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg leading-tight font-semibold sm:text-2xl">
                {productHref ? (
                  <Link
                    href={productHref}
                    className="outline-none hover:text-brand-accent-text focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </h2>
              {variant ? (
                <p className="mt-2 font-sans text-sm text-muted-foreground">
                  {variant}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 font-sans text-sm font-black tabular-nums sm:text-base">
              {formatMoney(
                item.total ?? item.unit_price * item.quantity,
                currency,
              )}
            </p>
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2 font-sans text-xs text-muted-foreground">
            <Avatar className="size-6 shrink-0 border border-border">
              {sellerLogo ? (
                <AvatarImage
                  src={sellerLogo.source}
                  alt={`Logo de ${sellerName}`}
                  loading="lazy"
                />
              ) : null}
              <AvatarFallback className="text-[0.6rem] font-bold">
                {sellerInitials(sellerName)}
              </AvatarFallback>
            </Avatar>
            <span className="shrink-0">Vendido por</span>
            <span className="truncate font-medium text-foreground/80">
              {sellerName}
            </span>
          </div>

          <p className="mt-3 font-sans text-xs text-muted-foreground sm:text-sm">
            {formatMoney(item.unit_price, currency)} por unidad
          </p>

          <Suspense fallback={<CartItemQuantitySkeleton />}>
            <CartItemQuantityRegion item={item} title={title} offers={offers} />
          </Suspense>
        </div>
      </div>
    </article>
  )
}
