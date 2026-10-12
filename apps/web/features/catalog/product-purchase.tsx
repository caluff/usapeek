"use client"

import {
  ArrowRight,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Store,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useId, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { AddCartItemResult } from "@/features/cart/add-item"
import { submitCartItem } from "@/features/cart/add-item-client"
import { notifyCartUpdated } from "@/features/cart/cart-events"
import { notifyCartItemAdded } from "@/features/cart/cart-sheet-events"
import {
  formatPrice,
  getLowestOfferPrice,
  getOfferPrice,
  isOfferAvailable,
  type StorefrontOffer,
} from "./offers"
import { cn } from "@/lib/utils"
import { ProductShipping } from "./product-shipping"
import { useProductVariantSelection } from "./product-variant-selection"

function QuantityField({
  maximum,
  disabled,
}: {
  maximum: number
  disabled: boolean
}) {
  const id = useId()
  const [quantity, setQuantity] = useState("1")
  const value = Number(quantity) || 1
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold">
        Cantidad
      </label>
      <div className="inline-flex h-11 border border-input bg-background">
        <button
          type="button"
          aria-label="Reducir cantidad"
          disabled={disabled || value <= 1}
          onClick={() => setQuantity(String(Math.max(1, value - 1)))}
          className="grid w-11 place-items-center hover:bg-muted disabled:opacity-35"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <input
          id={id}
          name="quantity"
          type="number"
          min={1}
          max={maximum}
          step={1}
          required
          disabled={disabled}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="w-12 min-w-0 bg-transparent text-center text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Aumentar cantidad"
          disabled={disabled || value >= maximum}
          onClick={() => setQuantity(String(Math.min(maximum, value + 1)))}
          className="grid w-11 place-items-center hover:bg-muted disabled:opacity-35"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function ProductPurchase({
  offers,
  hasRegion,
  summary,
  overview,
  paymentMethods,
}: {
  offers: StorefrontOffer[]
  hasRegion: boolean
  summary: ReactNode
  overview?: ReactNode
  paymentMethods?: ReactNode
}) {
  const router = useRouter()
  const cartButtonRef = useRef<HTMLButtonElement>(null)
  const { variants, variantId, selectVariant } = useProductVariantSelection()
  const [offerId, setOfferId] = useState("")
  const matchingOffers = offers.filter(
    (offer) => offer.variant_id === variantId,
  )
  const selectedOffer =
    matchingOffers.find((offer) => offer.id === offerId) ??
    (matchingOffers.length === 1 ? matchingOffers[0] : undefined)
  const price = selectedOffer
    ? getOfferPrice(selectedOffer)
    : getLowestOfferPrice(variantId ? matchingOffers : offers)
  const available = Boolean(
    selectedOffer &&
    getOfferPrice(selectedOffer) &&
    isOfferAvailable(selectedOffer),
  )
  const [state, action, isPending] = useActionState<
    AddCartItemResult | null,
    FormData
  >(async (_previous, form) => {
    const result = await submitCartItem(form)
    if (typeof result.cartCount === "number") {
      notifyCartUpdated(result.cartCount, result.confirmedAt)
      if (form.get("intent") === "buy") router.push("/checkout")
      else notifyCartItemAdded(cartButtonRef.current)
    }
    return result
  }, null)
  const error = state && "error" in state ? state.error : undefined
  const discount =
    price &&
    price.originalAmount !== null &&
    price.originalAmount > price.amount
      ? Math.round((1 - price.amount / price.originalAmount) * 100)
      : 0
  const availability = !hasRegion
    ? "Precio no disponible para esta región"
    : !variantId
      ? "Selecciona una variante"
      : !matchingOffers.length
        ? "Sin ofertas disponibles"
        : !selectedOffer
          ? "Selecciona una tienda"
          : available
            ? selectedOffer.allow_backorder
              ? "Disponible para pedido"
              : "En stock"
            : getOfferPrice(selectedOffer)
              ? "Sin stock"
              : "Precio no disponible"
  const maximum =
    selectedOffer?.manage_inventory && !selectedOffer.allow_backorder
      ? Math.max(1, Math.min(99, selectedOffer.inventory_quantity ?? 0))
      : 99

  return (
    <>
      <section
        className="min-w-0 font-sans"
        aria-label="Información y opciones del producto"
      >
        {summary}
        <div className="my-5 border-y border-border py-5" aria-live="polite">
          {!selectedOffer && price ? (
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Desde
            </p>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p
              className={cn(
                "font-bold tracking-tight",
                price ? "text-3xl" : "text-base",
              )}
            >
              {price
                ? formatPrice(price.amount)
                : "Precio no disponible en USD"}
            </p>
            {discount > 0 && price?.originalAmount ? (
              <>
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(price.originalAmount)}
                </span>
                <span className="bg-brand-accent/10 px-2 py-1 text-xs font-bold text-brand-accent-text">
                  −{discount}%
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Precios en dólares estadounidenses.
          </p>
        </div>
        {overview}
        {variants.length > 1 ? (
          <fieldset className="mt-5" disabled={isPending}>
            <legend className="mb-3 text-sm font-semibold">
              Selecciona una variante
            </legend>
            <div className="flex flex-wrap gap-2">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={variantId === variant.id}
                  onClick={() => {
                    selectVariant(variant.id)
                    setOfferId("")
                  }}
                  className={cn(
                    "min-h-11 border px-3 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50",
                    variantId === variant.id
                      ? "border-brand-accent bg-brand-accent/5 text-brand-accent-text"
                      : "border-border hover:border-foreground",
                  )}
                >
                  {variant.options?.map((option) => option.value).join(" / ") ||
                    variant.title}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
        {variantId && matchingOffers.length > 1 ? (
          <fieldset className="mt-5" disabled={isPending}>
            <legend className="mb-3 text-sm font-semibold">
              Elige la tienda{" "}
              <span className="font-normal text-muted-foreground">
                ({matchingOffers.length})
              </span>
            </legend>
            <div className="space-y-2">
              {matchingOffers.map((offer) => {
                const offerPrice = getOfferPrice(offer)
                return (
                  <label
                    key={offer.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 border p-3 text-sm",
                      selectedOffer?.id === offer.id
                        ? "border-brand-accent bg-brand-accent/5"
                        : "border-border",
                    )}
                  >
                    <input
                      type="radio"
                      name="seller_offer"
                      value={offer.id}
                      checked={selectedOffer?.id === offer.id}
                      onChange={() => setOfferId(offer.id)}
                      className="size-4 shrink-0 accent-brand-accent"
                    />
                    <span className="min-w-0 flex-1 break-words font-medium">
                      {offer.seller?.name ?? "Tienda"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold">
                      {offerPrice
                        ? formatPrice(offerPrice.amount)
                        : "Sin precio"}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : null}
        <a
          href="#product-details"
          className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-brand-accent-text"
        >
          Ver ficha técnica{" "}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </a>
      </section>
      <aside
        className="min-w-0 self-start border border-border bg-card p-5 font-sans shadow-sm md:col-span-2 lg:sticky lg:top-24 lg:col-span-1 lg:row-span-2"
        aria-label="Comprar producto"
      >
        <div aria-live="polite" className="mb-5">
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-bold",
              available ? "text-success" : "text-muted-foreground",
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full bg-current"
              aria-hidden="true"
            />
            {availability}
          </p>
          {selectedOffer && available ? (
            <p className="mt-1 pl-4 text-xs text-muted-foreground">
              {selectedOffer.manage_inventory &&
              !selectedOffer.allow_backorder &&
              typeof selectedOffer.inventory_quantity === "number"
                ? selectedOffer.inventory_quantity + " unidades disponibles"
                : "Disponibilidad confirmada por la tienda"}
            </p>
          ) : null}
        </div>
        <form
          action={action}
          className="space-y-3"
          key={selectedOffer?.id ?? variantId}
        >
          <input
            type="hidden"
            name="offer_id"
            value={selectedOffer?.id ?? ""}
          />
          <QuantityField maximum={maximum} disabled={!available || isPending} />
          <Button
            ref={cartButtonRef}
            type="submit"
            name="intent"
            value="cart"
            variant="accent"
            disabled={!available || !hasRegion || isPending}
            className="h-11 w-full text-sm"
          >
            {isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ShoppingBag className="size-4" aria-hidden="true" />
            )}
            {isPending ? "Agregando…" : "Agregar al carrito"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="buy"
            variant="outline"
            disabled={!available || !hasRegion || isPending}
            className="h-11 w-full border-brand-accent/20 bg-brand-accent/5 text-sm text-brand-accent-text"
          >
            Comprar ahora
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <div className="mt-5 space-y-4 border-t border-border pt-5 text-xs">
          <ProductShipping
            key={selectedOffer?.id ?? "no-offer"}
            offerId={selectedOffer?.id}
            sellerName={selectedOffer?.seller?.name}
          />
          <div className="flex gap-3">
            <Store
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Vendido por</p>
              <p className="mt-1 break-words text-muted-foreground">
                {selectedOffer?.seller?.name ??
                  "Selecciona una tienda para continuar"}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Package
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Revisa tu pedido</p>
              <p className="mt-1 leading-5 text-muted-foreground">
                Podrás revisar los productos y el total antes de pagar.
              </p>
            </div>
          </div>
        </div>
        {paymentMethods}
      </aside>
    </>
  )
}
