import type { HttpTypes } from "@medusajs/types"
import { getMoneyRoundingAdjustment } from "@/lib/money-rounding"
import { getDiscountSubtotal } from "../discount-subtotal"
import { formatMoney } from "../presentation"

export function OrderReceiptTotals({ order }: { order: HttpTypes.StoreOrder }) {
  const discount = getDiscountSubtotal(order)
  const totals: [string, number][] = [
    ["Productos", order.item_subtotal],
    ["Envío", order.shipping_subtotal],
    ["Impuestos", order.tax_total],
    ["Descuentos", discount > 0 ? -discount : 0],
  ]
  if (order.credit_line_total > 0) {
    totals.push(["Créditos aplicados", -order.credit_line_total])
  }
  const roundingAdjustment = getMoneyRoundingAdjustment({
    amounts: totals.map(([, amount]) => amount),
    total: order.total,
    currency: order.currency_code,
  })
  if (roundingAdjustment !== 0) {
    totals.push(["Ajuste por redondeo", roundingAdjustment])
  }

  return (
    <dl className="space-y-3 border-t border-border p-5 text-sm sm:p-6">
      {totals.map(([label, amount]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{formatMoney(amount, order.currency_code)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-border pt-4 text-lg font-semibold">
        <dt>Total</dt>
        <dd>{formatMoney(order.total, order.currency_code)}</dd>
      </div>
    </dl>
  )
}
