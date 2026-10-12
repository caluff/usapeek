import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { decimal, financeAmount, type FinanceOperation } from "./policy";
import { financeStripeClient } from "./provider";
import { readOrderTransfers } from "./list-order-transfers";
import { readStripeFactPages } from "./provider-facts";

export const financePayoutSchema = z.object({
  id: z.string(),
  amount: decimal,
  currency_code: z.literal("usd"),
  status: z.literal("paid"),
  account_id: z.string(),
  account: z.object({
    id: z.string(),
    data: z.object({ id: z.string().startsWith("acct_") }),
  }),
  data: z.object({
    id: z.string().startsWith("tr_"),
    transfer_group: z.string(),
    destination: z.string().startsWith("acct_"),
    livemode: z.literal(false),
    metadata: z.object({
      seller_id: z.string(),
      order_id: z.string().optional(),
    }),
  }),
});
export type FinancePayout = z.infer<typeof financePayoutSchema>;
export type FinanceSettlement = NonNullable<FinanceOperation["settlement"]>;

// Round cumulative commission, not individual refunds: the last refund exactly
// exhausts both the seller's transfer and the platform's retained commission.
export function proportionalSettlement(
  gross: number,
  sellerNet: number,
  refunded: number,
  amount: number,
) {
  const g = BigInt(MathBN.mult(financeAmount(gross), 100).toNumber());
  const n = BigInt(MathBN.mult(financeAmount(sellerNet), 100).toNumber());
  const r = BigInt(MathBN.mult(financeAmount(refunded), 100).toNumber());
  const a = BigInt(MathBN.mult(financeAmount(amount), 100).toNumber());
  if (g <= 0n || n > g || r + a > g)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El reparto de la liquidación requiere revisión.",
    );
  const commissionAt = (value: bigint) => ((g - n) * value + g / 2n) / g;
  const commission = commissionAt(r + a) - commissionAt(r);
  return {
    seller_reversed: Number(a - commission) / 100,
    commission_returned: Number(commission) / 100,
  };
}

export function settlementReduction(part: FinanceSettlement): number {
  return financeAmount(part.seller_entitlement_reduced ?? part.seller_reversed);
}

export function verifySettlementHistory(input: {
  gross: number;
  sellerNet: number;
  refunded: number;
  prior: FinanceSettlement[];
}) {
  const expected = proportionalSettlement(
    input.gross,
    input.sellerNet,
    0,
    input.refunded,
  );
  const reduced = input.prior.reduce(
    (sum, part) => MathBN.add(sum, settlementReduction(part)).toNumber(),
    0,
  );
  const commission = input.prior.reduce(
    (sum, part) => MathBN.add(sum, part.commission_returned).toNumber(),
    0,
  );
  if (
    !MathBN.eq(reduced, expected.seller_reversed) ||
    !MathBN.eq(commission, expected.commission_returned) ||
    input.prior.some(
      (part) =>
        !MathBN.eq(part.gross, input.gross) ||
        !MathBN.eq(part.seller_net, input.sellerNet) ||
        MathBN.gt(part.seller_reversed, settlementReduction(part)) ||
        (MathBN.gt(part.seller_reversed, 0) && !part.reversal_id) ||
        (part.reversal_id && !part.transfer_id),
    )
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Los ajustes no coinciden con el derecho original de la tienda.",
    );
  return { reduced, commission };
}

export async function prepareSettlement(input: {
  payout?: FinancePayout;
  orderId: string;
  sellerId: string;
  gross: number;
  sellerNet: number;
  refunded: number;
  amount: number;
  prior: FinanceSettlement[];
  paymentIntentId?: string;
  chargeId?: string;
  groupOrderIds?: string[];
}): Promise<FinanceSettlement> {
  const prior = verifySettlementHistory(input);
  const economics = proportionalSettlement(
    input.gross,
    input.sellerNet,
    input.refunded,
    input.amount,
  );
  const plan: FinanceSettlement = {
    version: 2,
    gross: input.gross,
    seller_net: input.sellerNet,
    seller_entitlement_reduced: economics.seller_reversed,
    commission_returned: economics.commission_returned,
    seller_reversal_amount: 0,
    seller_reversed: 0,
    component_attribution: "unallocated",
  };
  const stripe = financeStripeClient();
  if (input.paymentIntentId && !input.chargeId)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Falta el cargo de origen para inspeccionar las transferencias.",
    );
  const charge = input.chargeId
    ? await stripe.charges.retrieve(input.chargeId)
    : undefined;
  if (
    charge &&
    (charge.livemode ||
      charge.currency !== "usd" ||
      !charge.captured ||
      (typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id) !== input.paymentIntentId)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El cargo de origen requiere conciliación.",
    );
  const transferGroup = charge
    ? charge.transfer_group || `group_${input.paymentIntentId}`
    : input.orderId;
  const transfers = await readOrderTransfers(stripe, {
    order_id: input.orderId,
    transfer_group: transferGroup,
    group_order_ids: input.groupOrderIds,
  });
  if (!input.payout && transfers.length)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Hay una transferencia sin conciliar con este pedido.",
    );
  if (!input.payout) {
    if (input.prior.some((part) => part.transfer_id || part.reversal_id))
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Falta la liquidación de una reversión registrada.",
      );
    return plan;
  }
  const payout = input.payout;
  const transfer = transfers[0];
  const net = financeAmount(payout.amount);
  const priorReversed = input.prior.reduce(
    (sum, part) => MathBN.add(sum, part.seller_reversed).toNumber(),
    0,
  );
  const beforeTransfer = input.prior.reduce(
    (sum, part) =>
      part.transfer_id
        ? sum
        : MathBN.add(sum, settlementReduction(part)).toNumber(),
    0,
  );
  if (
    transfers.length !== 1 ||
    !transfer ||
    transfer.livemode ||
    transfer.id !== payout.data.id ||
    transfer.currency !== "usd" ||
    transfer.destination !== payout.account.data.id ||
    payout.data.destination !== payout.account.data.id ||
    payout.account_id !== payout.account.id ||
    ![input.orderId, transferGroup].includes(transfer.transfer_group ?? "") ||
    (transfer.transfer_group !== input.orderId &&
      transfer.metadata.order_id !== input.orderId) ||
    transfer.metadata.seller_id !== input.sellerId ||
    payout.data.metadata.seller_id !== input.sellerId ||
    !MathBN.eq(transfer.amount, MathBN.mult(net, 100)) ||
    !MathBN.eq(transfer.amount_reversed, MathBN.mult(priorReversed, 100)) ||
    !MathBN.eq(net, MathBN.sub(input.sellerNet, beforeTransfer)) ||
    !MathBN.eq(
      MathBN.sub(net, priorReversed),
      MathBN.sub(input.sellerNet, prior.reduced),
    ) ||
    input.prior.some(
      (part) =>
        part.transfer_id &&
        (part.payout_id !== payout.id ||
          part.transfer_id !== transfer.id ||
          part.destination !== payout.account.data.id),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La transferencia de esta tienda no coincide con su contabilidad.",
    );
  }
  const reversals = await readStripeFactPages(
    (cursor) =>
      stripe.transfers.listReversals(transfer.id, {
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    100,
  );
  const knownIds = input.prior.flatMap((part) =>
    part.reversal_id ? [part.reversal_id] : [],
  );
  if (
    !reversals.complete ||
    reversals.data.length !== knownIds.length ||
    reversals.data.some((part) => !knownIds.includes(part.id))
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Hay reversiones externas pendientes de conciliación.",
    );
  return {
    ...plan,
    payout_id: payout.id,
    transfer_id: transfer.id,
    transfer_group: transfer.transfer_group!,
    ...(typeof transfer.source_transaction === "string"
      ? { source_transaction: transfer.source_transaction }
      : {}),
    destination: payout.account.data.id,
    seller_reversal_amount: economics.seller_reversed,
  };
}

export async function reverseSettlement(
  settlement: FinanceSettlement,
  operationId: string,
  orderId: string,
) {
  const required = financeAmount(
    settlement.seller_reversal_amount ?? settlement.seller_reversed,
  );
  if (!required) return settlement;
  if (!settlement.transfer_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La reversión requiere una transferencia verificada.",
    );
  const stripe = financeStripeClient();
  const amount = MathBN.mult(required, 100).toNumber();
  const reversal = await stripe.transfers.createReversal(
    settlement.transfer_id,
    {
      amount,
      metadata: { finance_operation_id: operationId, order_id: orderId },
    },
    { idempotencyKey: `order-finance:${operationId}:reversal` },
  );
  if (
    reversal.amount !== amount ||
    reversal.transfer !== settlement.transfer_id ||
    reversal.metadata?.finance_operation_id !== operationId ||
    reversal.currency !== "usd"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La reversión requiere conciliación del operador.",
    );
  }
  return { ...settlement, seller_reversed: required, reversal_id: reversal.id };
}
