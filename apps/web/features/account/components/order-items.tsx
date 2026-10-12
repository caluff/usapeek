import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import { formatOrderAmount } from "../order-format"
import { getOrderItemThumbnail } from "../order-item-image"
import { getOrderItemQuantities } from "../order-amounts"

export function OrderItems({
  items,
  currencyCode,
  compact = false,
}: {
  items: HttpTypes.StoreOrderLineItem[]
  currencyCode: string
  compact?: boolean
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const thumbnail = getOrderItemThumbnail(item)
        const quantities = getOrderItemQuantities(item)
        return (
          <li
            key={item.id}
            className={
              compact
                ? "flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                : "grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 py-5 first:pt-0 last:pb-0 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
            }
          >
            <ProductThumbnail
              src={thumbnail}
              alt={item.title}
              sizes={compact ? "64px" : "(min-width: 640px) 96px, 80px"}
              className={compact ? "size-16" : "row-span-2 size-20 sm:size-24"}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5">
                {item.product_handle ? (
                  <Link
                    href={`/products/${encodeURIComponent(item.product_handle)}`}
                    className="hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </p>
              {item.variant_title &&
              !["Default Variant", "__default__"].includes(
                item.variant_title,
              ) ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.variant_title}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {quantities.returnedQuantity > 0 ? "Cantidad actual" : "Cantidad"}:
                {" "}{quantities.currentQuantity}
              </p>
              {quantities.returnedQuantity > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Comprados: {quantities.orderedQuantity} · Devueltos:{" "}
                  {quantities.returnedQuantity}
                </p>
              ) : null}
            </div>
            {!compact ? (
              <p className="col-start-2 text-sm font-semibold tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right">
                {formatOrderAmount(item.total, currencyCode)}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
