import {
  assertStripePlatformAccount,
  getStripeMode,
  isStripeLivemode,
  stripeModeSchema,
} from "../stripe-mode";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { PayoutAccountStatus } from "@mercurjs/types";
import {
  assertStripeAccountBinding,
  stripeAccountStatus,
} from "../stripe-connect/account-reconciliation";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import { financeAmount, financeOperationSchema } from "./policy";
import {
  assertProviderBalances,
  verifiedFinanceStripeClient,
  readFinanceProvider,
} from "./provider";
import { readOrderFinance } from "./read";
import type { AUTOMATIC_SETTLEMENT_AUTHORITY } from "./settlement-authorization";
import { requireSettlementAuthority } from "./settlement-authorization";
import { proportionalSettlement, verifySettlementHistory } from "./settlement";
import { readOrderTransfers } from "./list-order-transfers";

export { requireFinanceOperator } from "./settlement-authorization";

const money = z
  .number()
  .finite()
  .nonnegative()
  .refine((value) => {
    try {
      return financeAmount(value) === value;
    } catch {
      return false;
    }
  });
export const settlementPlanSchema = z
  .object({
    version: z.literal(1),
    order_id: z.string(),
    seller_id: z.string(),
    group_id: z.string(),
    cart_id: z.string(),
    payment_id: z.string(),
    payment_intent_id: z.string(),
    source_transaction: z.string(),
    transfer_group: z.string().min(1),
    platform_account_id: z.string(),
    account_id: z.string().nullable(),
    destination: z.string().nullable(),
    currency_code: z.literal("usd"),
    mode: stripeModeSchema,
    original_gross: money,
    original_commission: money,
    original_seller_entitlement: money,
    refunded: money,
    commission_returned: money,
    seller_entitlement_reduced: money,
    amount: money,
    outcome: z.enum(["transfer_required", "no_transfer_required"]),
  })
  .superRefine((plan, context) => {
    let valid = false;
    try {
      const adjustment = proportionalSettlement(
        plan.original_gross,
        plan.original_seller_entitlement,
        0,
        plan.refunded,
      );
      valid =
        MathBN.eq(
          MathBN.add(
            plan.original_commission,
            plan.original_seller_entitlement,
          ),
          plan.original_gross,
        ) &&
        MathBN.eq(adjustment.commission_returned, plan.commission_returned) &&
        MathBN.eq(
          adjustment.seller_reversed,
          plan.seller_entitlement_reduced,
        ) &&
        MathBN.eq(
          plan.amount,
          MathBN.sub(
            plan.original_seller_entitlement,
            plan.seller_entitlement_reduced,
          ),
        ) &&
        (plan.outcome === "transfer_required"
          ? plan.amount > 0 && Boolean(plan.account_id && plan.destination)
          : plan.amount === 0 &&
            plan.account_id === null &&
            plan.destination === null);
    } catch {
      /* Invalid economics must not be adopted during recovery. */
    }
    if (!valid)
      context.addIssue({
        code: "custom",
        message:
          "The settlement plan is inconsistent with its original economics.",
      });
  });
export type SettlementPlan = z.infer<typeof settlementPlanSchema>;

/** A per-order display allocation alone does not prove a full shared capture. */
export function assertSettlementCapture(
  current: Awaited<ReturnType<typeof readOrderFinance>>,
) {
  const { group, originals, original, finalCapture } = current;
  const collection = group.orders[0].cart.payment_collection;
  const payment = collection.payments[0];
  const allocations =
    finalCapture?.orders ??
    originals.map((sale) => ({ order_id: sale.order_id, amount: sale.gross }));
  const gross = originals.reduce(
    (sum, sale) => MathBN.add(sum, sale.gross).toNumber(),
    0,
  );
  const captured = allocations.reduce(
    (sum, part) => MathBN.add(sum, part.amount).toNumber(),
    0,
  );
  const valid =
    original &&
    payment &&
    payment.captures.length === 1 &&
    payment.provider_id === "pp_stripe_stripe" &&
    !payment.canceled_at &&
    MathBN.eq(gross, collection.amount) &&
    MathBN.eq(gross, payment.amount) &&
    MathBN.eq(payment.captures[0].amount, captured) &&
    (!finalCapture || finalCapture.capture_id === payment.captures[0].id) &&
    allocations.length === originals.length &&
    new Set(allocations.map((part) => part.order_id)).size ===
      originals.length &&
    originals.every((sale) => {
      const order = group.orders.find((item) => item.id === sale.order_id);
      const allocation = allocations.find(
        (part) => part.order_id === sale.order_id,
      );
      if (
        !order ||
        !allocation ||
        order.payment_collections.length ||
        order.cart.id !== group.cart_id ||
        order.cart.payment_collection.id !== collection.id ||
        order.cart.payment_collection.payments.length !== 1 ||
        order.cart.payment_collection.payments[0].id !== payment.id ||
        !(
          MathBN.eq(allocation.amount, sale.gross) ||
          (MathBN.eq(allocation.amount, 0) && order.status === "canceled")
        )
      )
        return false;
      const transactions = order.transactions.filter(
        (transaction) => transaction.reference === "capture",
      );
      return (
        transactions.length <= 1 &&
        transactions.every(
          (transaction) =>
            transaction.reference_id === payment.captures[0].id &&
            MathBN.eq(transaction.amount, allocation.amount) &&
            transaction.currency_code === "usd",
        )
      );
    }) &&
    MathBN.eq(
      allocations.find((part) => part.order_id === original.order_id)?.amount ??
        0,
      original.gross,
    );
  if (!valid)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La captura compartida requiere conciliación antes de liquidar.",
    );
}

export async function prepareOrderSettlement(
  container: MedusaContainer,
  input: { order_id: string; actor_id: string },
  token?: string,
  authority?: typeof AUTOMATIC_SETTLEMENT_AUTHORITY,
) {
  await requireSettlementAuthority(container, input.actor_id, authority);
  const current = await readOrderFinance(
    container,
    input.order_id,
    { actor_id: input.actor_id },
    token,
  );
  const original = current.original;
  const order = current.group.orders.find(
    (order) => order.id === input.order_id,
  )!;
  if (
    !original ||
    current.financialProblem ||
    current.hasPendingChanges ||
    MathBN.lt(order.summary?.pending_difference ?? 0, 0) ||
    current.state?.review_required ||
    (current.state?.active_token && current.state.active_token !== token) ||
    current.operations.some((operation) => operation.state !== "complete") ||
    current.payout
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La liquidación requiere conciliación previa.",
    );
  const captured = current.view.finance.captured_total;
  if (captured === 0 || !MathBN.eq(captured, original.gross))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No hay un cobro completo verificable para esta tienda.",
    );
  assertSettlementCapture(current);
  const prior = current.operations.flatMap((operation) => {
    const value = financeOperationSchema.safeParse(operation.result);
    return value.success &&
      value.data.order_id === input.order_id &&
      value.data.settlement
      ? [value.data.settlement]
      : [];
  });
  const adjustments = verifySettlementHistory({
    gross: original.gross,
    sellerNet: original.seller_entitlement,
    refunded: current.view.finance.refunded_total,
    prior,
  });
  if (prior.some((part) => part.transfer_id || part.reversal_id))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Falta una transferencia registrada previamente.",
    );
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  const refundOperations = current.operations.flatMap((operation) => {
    const parsed = financeOperationSchema.safeParse(operation.result);
    return parsed.success &&
      parsed.data.action !== "capture" &&
      parsed.data.refund_ids.length
      ? [{ id: operation.id, result: parsed.data }]
      : [];
  });
  const attributableRefunds =
    payment.refunds.every((refund) => {
      const matches = refundOperations.filter((operation) =>
        operation.result.refund_ids.includes(refund.id),
      );
      return (
        matches.length === 1 &&
        matches[0].result.refund_ids.length === 1 &&
        matches[0].id === refund.metadata?.finance_operation_id &&
        matches[0].result.order_id === refund.metadata?.order_id &&
        MathBN.eq(matches[0].result.amount, refund.amount)
      );
    }) &&
    refundOperations.every(
      (operation) =>
        operation.result.refund_ids.length === 1 &&
        payment.refunds.some(
          (refund) => refund.id === operation.result.refund_ids[0],
        ),
    );
  if (!attributableRefunds)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Hay reembolsos sin atribución financiera verificable.",
    );
  const provider = await readFinanceProvider(payment.data.id);
  assertProviderBalances(
    provider,
    payment.captures.reduce(
      (sum, part) => MathBN.add(sum, part.amount).toNumber(),
      0,
    ),
    payment.refunds.reduce(
      (sum, part) => MathBN.add(sum, part.amount).toNumber(),
      0,
    ),
    current.finalCapture?.released_refund_ids,
  );
  const stripe = await verifiedFinanceStripeClient();
  const chargeId =
    typeof provider.intent.latest_charge === "string"
      ? provider.intent.latest_charge
      : provider.intent.latest_charge?.id;
  if (provider.intent.status !== "succeeded" || !chargeId)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El cobro de origen no está confirmado.",
    );
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.disputed !== false)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El cobro tiene una disputa o su estado no está verificado. Requiere revisión antes de liquidar.",
    );
  const transferGroup = charge.transfer_group ?? `group_${provider.intent.id}`;
  const [platform, balance, transfers, accounts] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.balance.retrieve(),
    readOrderTransfers(stripe, {
      order_id: original.order_id,
      transfer_group: transferGroup,
      group_order_ids: current.group.orders.map((order) => order.id),
    }),
    container.resolve(ContainerRegistrationKeys.QUERY).graph(
      {
        entity: "seller_payout_account",
        fields: [
          "seller_id",
          "payout_account.id",
          "payout_account.data",
          "payout_account.status",
        ],
        filters: { seller_id: original.seller_id },
      },
      { cache: { enable: false } },
    ),
  ]);
  assertStripePlatformAccount(platform.id);
  if (
    !isStripeLivemode(balance.livemode) ||
    charge.id !== chargeId ||
    !isStripeLivemode(charge.livemode) ||
    charge.currency !== "usd" ||
    !charge.captured ||
    !charge.paid ||
    charge.status !== "succeeded" ||
    (typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id) !== payment.data.id ||
    !MathBN.eq(charge.amount_captured, provider.intent.amount_received) ||
    transfers.length
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El proveedor requiere conciliación antes de transferir.",
    );
  const amount = financeAmount(
    MathBN.sub(original.seller_entitlement, adjustments.reduced).toNumber(),
  );
  let accountId: string | null = null;
  let destination: string | null = null;
  if (amount > 0) {
    const links = z
      .array(
        z.object({
          seller_id: z.string(),
          payout_account: z.object({
            id: z.string(),
            data: z.object({ id: z.string() }).passthrough(),
            status: z.string(),
          }),
        }),
      )
      .parse(accounts.data);
    if (links.length !== 1 || links[0].seller_id !== original.seller_id)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La cuenta de destino no es inequívoca.",
      );
    const local = links[0].payout_account;
    const account = await stripe.accounts.retrieve(local.data.id);
    assertStripeAccountBinding(account, local);
    if (
      local.status !== PayoutAccountStatus.ACTIVE ||
      stripeAccountStatus(
        account,
        getStripeConnectConfiguration()?.accountValidation,
      ) !== PayoutAccountStatus.ACTIVE
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La cuenta Connect no está habilitada para transferir.",
      );
    accountId = local.id;
    destination = account.id;
  }
  return {
    current,
    plan: settlementPlanSchema.parse({
      version: 1,
      order_id: original.order_id,
      seller_id: original.seller_id,
      group_id: original.group_id,
      cart_id: original.cart_id,
      payment_id: payment.id,
      payment_intent_id: payment.data.id,
      source_transaction: charge.id,
      transfer_group: transferGroup,
      platform_account_id: platform.id,
      account_id: accountId,
      destination,
      currency_code: "usd",
      mode: getStripeMode(),
      original_gross: original.gross,
      original_commission: original.commission,
      original_seller_entitlement: original.seller_entitlement,
      refunded: current.view.finance.refunded_total,
      commission_returned: adjustments.commission,
      seller_entitlement_reduced: adjustments.reduced,
      amount,
      outcome: amount ? "transfer_required" : "no_transfer_required",
    }),
  };
}
