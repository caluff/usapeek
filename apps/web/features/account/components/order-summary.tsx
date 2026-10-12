import type { HttpTypes } from "@medusajs/types";
import { getMoneyRoundingAdjustment } from "@/lib/money-rounding";
import { formatOrderAmount } from "../order-format";
import { getOrderAmounts, getOrderItemQuantities } from "../order-amounts";

export function OrderAddress({
  address,
}: {
  address: HttpTypes.StoreOrderAddress | null | undefined;
}) {
  if (!address)
    return (
      <p className="text-sm text-muted-foreground">Sin dirección registrada.</p>
    );
  return (
    <address className="space-y-1 text-sm leading-6 not-italic text-muted-foreground">
      <p className="font-medium text-foreground">
        {[address.first_name, address.last_name].filter(Boolean).join(" ")}
      </p>
      {address.company ? <p>{address.company}</p> : null}
      <p>{address.address_1}</p>
      {address.address_2 ? <p>{address.address_2}</p> : null}
      <p>
        {[address.city, address.province?.toUpperCase(), address.postal_code]
          .filter(Boolean)
          .join(", ")}
      </p>
      <p>
        {address.country_code?.toLowerCase() === "us"
          ? "Estados Unidos"
          : address.country_code?.toUpperCase()}
      </p>
    </address>
  );
}

export function OrderTotals({
  order,
  highlighted = false,
  showPaymentHistory = true,
}: {
  order: HttpTypes.StoreOrder;
  highlighted?: boolean;
  showPaymentHistory?: boolean;
}) {
  const amount = (value: number | null) =>
    value === null
      ? "No disponible"
      : formatOrderAmount(value, order.currency_code);
  const amounts = getOrderAmounts(order);
  const hasReturns = order.items?.some(
    (item) => getOrderItemQuantities(item).returnedQuantity > 0,
  );
  const discount = order.discount_total - order.discount_tax_total;
  const roundingAdjustment = getMoneyRoundingAdjustment({
    amounts: [
      order.original_item_subtotal,
      order.original_shipping_subtotal,
      discount > 0 ? -discount : 0,
      order.tax_total > 0 ? order.tax_total : 0,
      order.credit_line_total > 0 ? -order.credit_line_total : 0,
    ],
    total: order.total,
    currency: order.currency_code,
  });
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">
          {hasReturns ? "Productos actuales" : "Productos"}
        </dt>
        <dd className="tabular-nums">{amount(order.original_item_subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Envío</dt>
        <dd className="tabular-nums">
          {amount(order.original_shipping_subtotal)}
        </dd>
      </div>
      {discount > 0 ? (
        <div className="flex justify-between gap-4">
          <dt>Descuentos</dt>
          <dd>−{amount(discount)}</dd>
        </div>
      ) : null}
      {order.tax_total > 0 ? (
        <div className="flex justify-between gap-4">
          <dt>Impuestos</dt>
          <dd>{amount(order.tax_total)}</dd>
        </div>
      ) : null}
      {order.credit_line_total > 0 ? (
        <div className="flex justify-between gap-4">
          <dt>Créditos aplicados</dt>
          <dd>−{amount(order.credit_line_total)}</dd>
        </div>
      ) : null}
      {roundingAdjustment !== 0 ? (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ajuste por redondeo</dt>
          <dd className="tabular-nums">{amount(roundingAdjustment)}</dd>
        </div>
      ) : null}
      <div
        className={
          highlighted
            ? "flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3 text-base font-semibold"
            : "flex justify-between gap-4 border-t border-border pt-4 text-base font-semibold"
        }
      >
        <dt>{hasReturns ? "Total actual del pedido" : "Total del pedido"}</dt>
        <dd className="tabular-nums">
          {amount(amounts.currentTotal)}
          {highlighted ? (
            <span className="ml-1 text-xs">
              {order.currency_code.toUpperCase()}
            </span>
          ) : null}
        </dd>
      </div>
      {showPaymentHistory ? (
        <>
          <div className="flex justify-between gap-4 border-t border-border pt-3">
            <dt className="text-muted-foreground">Cobrado de este pedido</dt>
            <dd className="tabular-nums">{amount(amounts.chargedTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Reembolsado de este pedido
            </dt>
            <dd className="tabular-nums">{amount(amounts.refundedTotal)}</dd>
          </div>
          {amounts.refundedTotal !== null && amounts.refundedTotal > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Cobrado neto</dt>
              <dd className="tabular-nums">
                {amount(amounts.netChargedTotal)}
              </dd>
            </div>
          ) : null}
        </>
      ) : null}
    </dl>
  );
}
