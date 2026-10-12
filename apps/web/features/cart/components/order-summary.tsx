import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import { getMoneyRoundingAdjustment } from "@/lib/money-rounding"
import { getDiscountSubtotal } from "../discount-subtotal"
import { formatMoney } from "../presentation"
import { getCartItemVariantDescription } from "../variant-description"

function OrderSummaryItem({
  item,
  currency,
}: {
  item: HttpTypes.StoreCartLineItem
  currency: string
}) {
  const title = item.product_title ?? item.title
  const variant = getCartItemVariantDescription(item)

  return (
    <li className="flex items-start gap-4">
      <ProductThumbnail
        src={
          item.thumbnail ||
          item.variant?.thumbnail ||
          item.product?.thumbnail ||
          item.product?.images?.[0]?.url ||
          item.variant?.product?.thumbnail ||
          item.variant?.product?.images?.[0]?.url
        }
        alt={title}
        className="size-20"
        sizes="80px"
      />
      <div className="min-w-0 flex-1 font-sans">
        <h3 className="text-sm leading-snug font-semibold wrap-break-word">
          {title}
        </h3>
        {variant ? (
          <p className="mt-1 text-xs text-muted-foreground wrap-break-word">
            {variant}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {item.quantity} × {formatMoney(item.unit_price, currency)}
          <span className="sr-only"> por unidad</span>
        </p>
      </div>
    </li>
  )
}

export function OrderSummary({
  cart,
  children,
}: {
  cart: HttpTypes.StoreCart
  children?: ReactNode
}) {
  const money = (amount: number) => formatMoney(amount, cart.currency_code)
  const subtotal = cart.item_subtotal ?? cart.subtotal
  const shippingAmount = cart.shipping_methods?.length
    ? cart.shipping_subtotal
    : undefined
  const taxAmount = cart.shipping_address?.address_1 ? cart.tax_total : undefined
  const discount = getDiscountSubtotal(cart)
  const roundingAdjustment =
    cart.shipping_methods?.length && cart.shipping_address?.address_1
      ? getMoneyRoundingAdjustment({
          amounts: [
            cart.item_subtotal ?? cart.subtotal ?? 0,
            discount > 0 ? -discount : 0,
            cart.shipping_subtotal ?? 0,
            cart.tax_total ?? 0,
          ],
          total: cart.total ?? 0,
          currency: cart.currency_code,
        })
      : 0
  const itemCount =
    cart.items?.reduce((total, item) => total + item.quantity, 0) ?? 0
  const showSubtotal =
    typeof subtotal === "number" &&
    (discount > 0 ||
      (shippingAmount ?? 0) !== 0 ||
      (taxAmount ?? 0) !== 0 ||
      roundingAdjustment !== 0 ||
      (typeof cart.total === "number" && subtotal !== cart.total))
  const hasPriceBreakdown =
    showSubtotal ||
    discount > 0 ||
    typeof shippingAmount === "number" ||
    typeof taxAmount === "number" ||
    roundingAdjustment !== 0
  return (
    <section
      aria-label="Resumen del pedido"
      className="border border-border bg-card p-6"
    >
      <h2 className="text-2xl font-semibold">Tu pedido</h2>
      {cart.items?.length ? (
        <ul className="mt-5 space-y-5" aria-label="Productos del pedido">
          {cart.items.map((item) => (
            <OrderSummaryItem
              key={item.id}
              item={item}
              currency={cart.currency_code}
            />
          ))}
        </ul>
      ) : null}
      <dl
        className={`mt-6 space-y-4 font-sans text-sm ${hasPriceBreakdown ? "border-t border-border pt-5" : ""}`}
      >
        {showSubtotal ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              Subtotal ({itemCount} {itemCount === 1 ? "producto" : "productos"})
            </dt>
            <dd className="font-medium tabular-nums">{money(subtotal)}</dd>
          </div>
        ) : null}
        {discount > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Descuentos</dt>
            <dd className="font-medium tabular-nums">
              −{money(discount)}
            </dd>
          </div>
        ) : null}
        {typeof shippingAmount === "number" ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Envío</dt>
            <dd className="font-medium tabular-nums">{money(shippingAmount)}</dd>
          </div>
        ) : null}
        {typeof taxAmount === "number" ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Impuestos</dt>
            <dd className="font-medium tabular-nums">{money(taxAmount)}</dd>
          </div>
        ) : null}
        {roundingAdjustment !== 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Ajuste por redondeo</dt>
            <dd className="font-medium tabular-nums">
              {money(roundingAdjustment)}
            </dd>
          </div>
        ) : null}
        {typeof cart.total === "number" ? (
          <div className="flex justify-between gap-3 border-t border-dashed border-foreground pt-5 text-lg font-black">
            <dt>Total (USD)</dt>
            <dd className="tabular-nums">{money(cart.total)}</dd>
          </div>
        ) : null}
      </dl>
      {children}
    </section>
  )
}
