"use client"

import type { HttpTypes } from "@medusajs/types"
import { ImageIcon, LoaderCircle, Minus, Plus, Trash2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getProductImage } from "@/features/catalog/image"
import { getCartItemVariantDescription } from "../variant-description"

export function CartSheetItem({
  item,
  disabled,
  isPending,
  onQuantityChange,
  onNavigate,
}: {
  item: HttpTypes.StoreCartLineItem
  disabled: boolean
  isPending: boolean
  onQuantityChange: (itemId: string, quantity: number) => void
  onNavigate: () => void
}) {
  const title = item.product_title ?? item.title
  const image = getProductImage(
    item.thumbnail ??
      item.variant?.thumbnail ??
      item.variant?.product?.thumbnail ??
      item.variant?.product?.images?.[0]?.url,
  )
  const variant = getCartItemVariantDescription(item)
  const href = item.product_handle
    ? `/products/${encodeURIComponent(item.product_handle)}`
    : null

  return (
    <li className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="relative aspect-square w-full max-w-32 overflow-hidden">
        {image ? (
          <Image
            src={image.source}
            alt={title}
            fill
            sizes="128px"
            unoptimized={image.unoptimized}
            className="object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden="true" />
          </div>
        )}
        {href ? (
          <Link
            href={href}
            onClick={onNavigate}
            aria-label={variant ? `${title}, ${variant}` : title}
            className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
          />
        ) : null}
      </div>
      <div
        className="inline-flex items-center border border-border"
        role="group"
        aria-label={`Cantidad de ${title}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-11"
          disabled={disabled}
          aria-label={
            item.quantity === 1
              ? `Eliminar ${title} del carrito`
              : `Reducir cantidad de ${title}`
          }
          onClick={() => onQuantityChange(item.id, item.quantity - 1)}
        >
          {item.quantity === 1 ? (
            <Trash2 className="size-4" aria-hidden="true" />
          ) : (
            <Minus className="size-4" aria-hidden="true" />
          )}
        </Button>
        <output
          aria-label={`${item.quantity} unidades de ${title}`}
          aria-live="polite"
          className="grid w-10 place-items-center text-sm font-semibold tabular-nums"
        >
          {isPending ? (
            <LoaderCircle
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-label="Guardando cantidad"
            />
          ) : (
            item.quantity
          )}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-11"
          disabled={disabled || item.quantity >= 99}
          aria-label={`Aumentar cantidad de ${title}`}
          onClick={() => onQuantityChange(item.id, item.quantity + 1)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}
