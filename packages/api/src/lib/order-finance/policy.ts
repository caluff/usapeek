import { isStripeLivemode } from "../stripe-mode";
import { BigNumber, MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type { OrderFinanceResponse } from "./contracts";

export const decimal = z.union([
  z.number().finite(),
  z.string().regex(/^\d+(?:\.\d+)?$/),
  z.instanceof(BigNumber).transform((value) => value.numeric),
]);
const signedDecimal = z.union([
  z.number().finite(),
  z
    .string()
    .regex(/^-?\d+(?:\.\d+)?$/)
    .transform(Number),
  z.instanceof(BigNumber).transform((value) => value.numeric),
]);
const instant = z.union([z.date(), z.iso.datetime({ offset: true })]);
const paymentSchema = z.object({
  id: z.string(),
  provider_id: z.string(),
  payment_session_id: z.string().optional(),
  currency_code: z.string().optional(),
  amount: decimal,
  canceled_at: instant.nullable(),
  data: z
    .object({
      id: z.string(),
      livemode: z
        .boolean()
        .refine((value) => isStripeLivemode(value), "Stripe mode mismatch"),
    })
    .passthrough(),
  captures: z.array(z.object({ id: z.string(), amount: decimal })),
  refunds: z.array(
    z.object({
      id: z.string(),
      amount: decimal,
      metadata: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
export const financeGroupSchema = z.object({
  id: z.string(),
  cart_id: z.string(),
  orders: z
    .array(
      z.object({
        id: z.string(),
        customer_id: z.string().nullable().optional(),
        status: z.string(),
        currency_code: z.literal("usd"),
        total: decimal,
        summary: z
          .object({ pending_difference: signedDecimal.optional() })
          .passthrough()
          .nullable(),
        payment_collections: z.array(
          z.object({
            id: z.string(),
            currency_code: z.string().optional(),
            amount: decimal.optional(),
            metadata: z.record(z.string(), z.unknown()).nullable().optional(),
            payments: z.array(paymentSchema).optional(),
          }),
        ),
        seller: z.object({ id: z.string() }),
        transactions: z.array(
          z.object({
            id: z.string(),
            amount: signedDecimal,
            reference: z.string(),
            reference_id: z.string(),
            currency_code: z.string().optional(),
          }),
        ),
        credit_lines: z
          .array(
            z.object({
              id: z.string(),
              amount: decimal,
              reference: z.string().nullable(),
              reference_id: z.string().nullable(),
            }),
          )
          .optional(),
        items: z
          .array(
            z.object({
              id: z.string().optional(),
              quantity: decimal,
              detail: z.object({
                fulfilled_quantity: decimal,
                shipped_quantity: decimal.optional(),
                return_requested_quantity: decimal.optional(),
                return_received_quantity: decimal.optional(),
                return_dismissed_quantity: decimal.optional(),
              }),
            }),
          )
          .optional(),
        fulfillments: z.array(
          z.object({ id: z.string(), canceled_at: instant.nullable() }),
        ),
        cart: z.object({
          id: z.string(),
          payment_collection: z.object({
            id: z.string(),
            amount: decimal,
            status: z.string(),
            metadata: z.record(z.string(), z.unknown()).nullable().optional(),
            payments: z.array(paymentSchema),
          }),
        }),
      }),
    )
    .min(1)
    .max(50),
});
export type FinanceGroup = z.infer<typeof financeGroupSchema>;
export const financeAllocationSchema = z.object({
  payment_id: z.string(),
  currency_code: z.literal("usd"),
  orders: z
    .array(z.object({ order_id: z.string(), amount: decimal }))
    .min(1)
    .max(50),
});
export type FinanceAllocation = z.infer<typeof financeAllocationSchema>;
export const finalCaptureSchema = z.object({
  capture_id: z.string(),
  orders: financeAllocationSchema.shape.orders,
  released_refund_ids: z.array(z.string()),
});
export type FinalCapture = z.infer<typeof finalCaptureSchema>;
export const captureEvidenceSchema = z.object({
  payment_intent_id: z.string().min(1),
  charge_id: z.string().min(1),
  amount: decimal.transform(financeAmount),
  released_refund_ids: z.array(z.string().min(1)),
  orders: financeAllocationSchema.shape.orders,
});
export type CaptureEvidence = z.infer<typeof captureEvidenceSchema>;
export const financeOperationSchema = z.object({
  actor_id: z.string().optional(),
  customer_id: z.string().optional(),
  execution_owner_id: z.string().optional(),
  execution_host: z.string().optional(),
  execution_pid: z.number().int().positive().optional(),
  order_id: z.string(),
  request_id: z.uuid(),
  action: z.enum(["cancel", "refund", "capture"]),
  amount: decimal,
  note: z.string(),
  fingerprint: z.string(),
  refund_ids: z.array(z.string()).default([]),
  credit_amount: decimal.optional(),
  provider_refund_id: z.string().optional(),
  refund_attempted: z.boolean().optional(),
  reversal_attempted: z.boolean().optional(),
  capture_attempted: z.boolean().optional(),
  cancel_authorization_attempted: z.boolean().optional(),
  capture_orders: financeAllocationSchema.shape.orders.optional(),
  capture_evidence: captureEvidenceSchema.optional(),
  settlement: z
    .object({
      version: z.literal(2).optional(),
      payout_id: z.string().optional(),
      transfer_id: z.string().optional(),
      transfer_group: z.string().optional(),
      source_transaction: z.string().optional(),
      destination: z.string().optional(),
      gross: decimal,
      seller_net: decimal,
      seller_entitlement_reduced: decimal.optional(),
      seller_reversal_amount: decimal.optional(),
      seller_reversed: decimal,
      commission_returned: decimal,
      reversal_id: z.string().optional(),
      component_attribution: z.literal("unallocated").optional(),
    })
    .optional(),
});
export type FinanceOperation = z.infer<typeof financeOperationSchema>;

export function financeAmount(value: z.infer<typeof decimal>): number {
  const amount = MathBN.convert(value);
  if (
    MathBN.lt(amount, 0) ||
    !MathBN.eq(amount, amount.toFixed(2)) ||
    !Number.isSafeInteger(MathBN.mult(amount, 100).toNumber())
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El importe debe ser exacto, no negativo y tener como máximo dos decimales.",
    );
  }
  return amount.toNumber();
}

export function initialAllocation(group: FinanceGroup): FinanceAllocation {
  const payment = group.orders[0].cart.payment_collection.payments[0];
  if (!payment)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No hay un pago autorizado para este pedido.",
    );
  return {
    payment_id: payment.id,
    currency_code: "usd",
    orders: group.orders.map((order) => ({
      order_id: order.id,
      amount: financeAmount(order.total),
    })),
  };
}

export function financeView(input: {
  group: FinanceGroup;
  orderId: string;
  allocation: FinanceAllocation;
  history: OrderFinanceResponse["finance"]["history"];
  knownRefundIds: string[];
  isHeld: boolean;
  hasPayout: boolean;
  payoutProblem?: string | null;
  finalCapture?: FinalCapture;
  isOperator?: boolean;
  customerId?: string;
}): OrderFinanceResponse {
  const { group, allocation, history } = input;
  const order = group.orders.find((order) => order.id === input.orderId);
  if (!order)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido no encontrado.");
  if (input.customerId !== undefined && order.customer_id !== input.customerId)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No encontramos este pedido en tu cuenta.",
    );
  const collection = order.cart.payment_collection;
  const payment = collection.payments[0];
  const allocated = allocation.orders.find(
    (item) => item.order_id === order.id,
  );
  const allocatedTotal = financeAmount(allocated?.amount ?? order.total);
  const refundedTotal = history
    .filter((item) => item.status === "complete" && item.kind !== "capture")
    .reduce((sum, item) => MathBN.add(sum, item.amount).toNumber(), 0);
  const capturedTotal = (payment?.captures ?? []).reduce(
    (sum, item) => MathBN.add(sum, financeAmount(item.amount)).toNumber(),
    0,
  );
  const paymentRefunded = (payment?.refunds ?? []).reduce(
    (sum, item) => MathBN.add(sum, financeAmount(item.amount)).toNumber(),
    0,
  );
  const allocationTotal = allocation.orders.reduce(
    (sum, item) => MathBN.add(sum, financeAmount(item.amount)).toNumber(),
    0,
  );
  const finalCapture = input.finalCapture;
  const ownCaptured =
    capturedTotal === 0
      ? 0
      : finalCapture
        ? financeAmount(
            finalCapture.orders.find((part) => part.order_id === order.id)
              ?.amount ?? 0,
          )
        : allocatedTotal;
  const validFinalCapture =
    finalCapture &&
    payment?.captures.length === 1 &&
    payment.captures[0].id === finalCapture.capture_id &&
    finalCapture.orders.length === allocation.orders.length &&
    new Set(finalCapture.orders.map((part) => part.order_id)).size ===
      allocation.orders.length &&
    finalCapture.orders.every((part) => {
      const original = allocation.orders.find(
        (item) => item.order_id === part.order_id,
      );
      return (
        original &&
        (MathBN.eq(part.amount, original.amount) ||
          (MathBN.eq(part.amount, 0) &&
            group.orders.find((item) => item.id === part.order_id)?.status ===
              "canceled"))
      );
    }) &&
    MathBN.eq(
      capturedTotal,
      finalCapture.orders.reduce(
        (sum, part) => MathBN.add(sum, part.amount).toNumber(),
        0,
      ),
    );
  let problem: string | null = null;
  if (
    !payment ||
    collection.payments.length !== 1 ||
    !allocated ||
    allocation.payment_id !== payment.id ||
    allocation.currency_code !== order.currency_code ||
    allocation.orders.length !== group.orders.length ||
    new Set(allocation.orders.map((item) => item.order_id)).size !==
      group.orders.length ||
    group.orders.some(
      (item) =>
        item.payment_collections.length ||
        item.cart.id !== group.cart_id ||
        item.cart.payment_collection.id !== collection.id ||
        !allocation.orders.some((part) => part.order_id === item.id),
    ) ||
    !MathBN.eq(allocationTotal, collection.amount) ||
    !MathBN.eq(allocationTotal, payment.amount) ||
    payment.provider_id !== "pp_stripe_stripe" ||
    !payment.data.id.startsWith("pi_")
  ) {
    problem = "El reparto del pago requiere revisión del operador.";
  } else if (
    input.isHeld ||
    history.some((item) => item.status !== "complete")
  ) {
    problem =
      "Hay una operación pendiente de conciliación. No repitas el reembolso; contacta con el operador.";
  } else if (
    payment.refunds.some((refund) => !input.knownRefundIds.includes(refund.id))
  ) {
    problem =
      "Hay reembolsos sin asignar a una tienda. El operador debe conciliarlos antes de continuar.";
  } else if (
    capturedTotal > 0 &&
    ((!MathBN.eq(capturedTotal, allocationTotal) && !validFinalCapture) ||
      payment.captures.length !== 1)
  ) {
    problem =
      "La captura parcial requiere verificar el importe cobrado a cada tienda.";
  } else if (input.payoutProblem || input.hasPayout) {
    problem =
      input.payoutProblem ??
      "Este pedido ya tiene una liquidación a la tienda; requiere conciliarla antes del reembolso.";
  }
  if (finalCapture && !validFinalCapture)
    problem = "La captura final requiere conciliación del operador.";
  const captureTransactions = order.transactions.filter(
    (transaction) => transaction.reference === "capture",
  );
  if (
    !problem &&
    captureTransactions.length &&
    (captureTransactions.length !== 1 ||
      captureTransactions[0].reference_id !== payment.captures[0]?.id ||
      !MathBN.eq(captureTransactions[0].amount, ownCaptured))
  ) {
    problem = "La contabilidad del cobro de esta tienda requiere conciliación.";
  }
  const remaining = Math.max(
    0,
    MathBN.sub(ownCaptured, refundedTotal).toNumber(),
  );
  const refundable =
    capturedTotal > 0
      ? Math.max(
          0,
          Math.min(
            remaining,
            MathBN.sub(capturedTotal, paymentRefunded).toNumber(),
          ),
        )
      : 0;
  let cancellationReason = problem;
  if (
    !cancellationReason &&
    input.customerId !== undefined &&
    order.fulfillments.length
  )
    cancellationReason =
      "La tienda ya empezó a preparar este pedido. La cancelación desde tu cuenta ya no está disponible.";
  if (!cancellationReason && order.status !== "pending")
    cancellationReason =
      order.status === "canceled"
        ? "El pedido ya está cancelado."
        : "Solo se pueden cancelar pedidos abiertos. Para un pedido completado utiliza el reembolso.";
  if (
    !cancellationReason &&
    order.fulfillments.some((item) => !item.canceled_at)
  )
    cancellationReason =
      "Cancela primero las preparaciones del pedido. Si ya se envió, gestiona la devolución antes de cancelar.";
  let refundReason = problem;
  if (!refundReason && input.customerId !== undefined)
    refundReason = "Los reembolsos los gestiona la tienda o el operador.";
  if (!refundReason && order.status === "canceled")
    refundReason = "El pedido ya está cancelado.";
  if (!refundReason && !["pending", "completed"].includes(order.status))
    refundReason =
      "El estado del pedido requiere revisión antes de reembolsar.";
  if (!refundReason && capturedTotal === 0)
    refundReason =
      "El pago solo está autorizado; todavía no hay un cobro que reembolsar.";
  if (!refundReason && refundable <= 0)
    refundReason = "No queda importe reembolsable en este pedido.";
  const retained = group.orders.filter((item) => item.status !== "canceled");
  const captureAmount = allocation.orders
    .filter((part) => retained.some((item) => item.id === part.order_id))
    .reduce((sum, part) => MathBN.add(sum, part.amount).toNumber(), 0);
  let captureReason = problem;
  if (!captureReason && !input.isOperator)
    captureReason = "Solo el operador puede cobrar la compra compartida.";
  if (!captureReason && (capturedTotal > 0 || finalCapture))
    captureReason = "La captura de esta compra ya se realizó.";
  if (
    !captureReason &&
    (payment?.canceled_at || captureAmount <= 0 || order.status === "canceled")
  )
    captureReason =
      "No hay una autorización pendiente para cobrar desde este pedido.";
  if (
    !captureReason &&
    retained.some(
      (item) =>
        !["pending", "completed"].includes(item.status) ||
        !item.items?.length ||
        item.items.some(
          (line) =>
            !MathBN.gt(line.quantity, 0) ||
            !MathBN.eq(line.quantity, line.detail.fulfilled_quantity),
        ) ||
        !item.fulfillments.some((fulfillment) => !fulfillment.canceled_at),
    )
  ) {
    captureReason =
      "Prepara todos los artículos de los pedidos activos antes de cobrar la compra.";
  }
  return {
    finance: {
      order_id: order.id,
      currency_code: order.currency_code,
      allocated_total: allocatedTotal,
      refunded_total: refundedTotal,
      refundable_total: refundable,
      captured_total: ownCaptured,
      capture: {
        allowed: !captureReason,
        reason: captureReason,
        amount: input.isOperator ? captureAmount : 0,
      },
      cancellation: {
        allowed: !cancellationReason,
        reason: cancellationReason,
        refund_amount: refundable,
      },
      refund: { allowed: !refundReason, reason: refundReason },
      history,
    },
  };
}
