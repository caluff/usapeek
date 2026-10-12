import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type PayoutModule from "@mercurjs/core/modules/payout";
import { MercurModules } from "@mercurjs/types";
import type { PayoutDTO } from "@mercurjs/types";
import type Stripe from "stripe";
import { payoutOperationSchema } from "../../workflows/settle-order-finance";
import {
  financeAmount,
  financeOperationSchema,
  type FinanceGroup,
} from "./policy";
import {
  financeStripeClient,
  readFinanceProvider,
  assertProviderBalances,
} from "./provider";
import { readStripeFactPages } from "./provider-facts";
import { readOrderTransfers } from "./list-order-transfers";
import { readOrderFinance } from "./read";
import {
  requireFinanceOperator,
  assertSettlementCapture,
} from "./settlement-plan";
import {
  prepareSettlement,
  proportionalSettlement,
  settlementReduction,
  verifySettlementHistory,
} from "./settlement";
import { inspectAuthorizationRecovery } from "./recovery-authorization";

export const recoveryInputSchema = z.object({
  order_id: z.string().startsWith("order_"),
  operation_id: z.string().min(1),
  actor_id: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});
export type RecoveryInput = z.infer<typeof recoveryInputSchema>;
export type RecoveryAction =
  | "adopt_payout"
  | "link_payout"
  | "adopt_refund"
  | "create_refund"
  | "record_refund_transaction"
  | "record_capture_transaction"
  | "create_credit_line"
  | "cancel_order"
  | "adopt_capture"
  | "record_final_capture";
type Order = FinanceGroup["orders"][number];
export type RecoveryCurrent = Awaited<ReturnType<typeof readOrderFinance>>;

export function requireRecovery(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message);
}
const minor = (amount: Parameters<typeof financeAmount>[0]) =>
  MathBN.mult(financeAmount(amount), 100).toNumber();
const idOf = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;

export function hasRecoveryTransaction(
  order: Order,
  reference: "capture" | "refund",
  referenceId: string,
  amount: number,
) {
  if (reference === "capture")
    requireRecovery(
      order.transactions.every(
        (transaction) =>
          transaction.reference !== "capture" ||
          transaction.reference_id === referenceId,
      ),
      "Hay una transacción de otra captura en el pedido.",
    );
  const records = order.transactions.filter(
    (transaction) =>
      transaction.reference === reference &&
      transaction.reference_id === referenceId,
  );
  requireRecovery(
    records.length <= 1 &&
      records.every(
        (record) =>
          MathBN.eq(record.amount, amount) && record.currency_code === "usd",
      ),
    "La transacción registrada no coincide con el efecto verificado.",
  );
  return records.length === 1;
}

export function hasRecoveryCredit(
  order: Order,
  refundId: string,
  amount: number,
) {
  requireRecovery(
    order.credit_lines !== undefined,
    "Falta la proyección de las notas de crédito.",
  );
  const records = order.credit_lines.filter(
    (credit) =>
      credit.reference === "refund" && credit.reference_id === refundId,
  );
  requireRecovery(
    records.length <= 1 &&
      records.every((record) => MathBN.eq(record.amount, amount)),
    "La nota de crédito registrada no coincide con el plan congelado.",
  );
  requireRecovery(
    amount !== 0 || records.length === 0,
    "Hay una nota de crédito no prevista en el plan.",
  );
  return records.length === 1;
}

async function inspectPayout(
  container: MedusaContainer,
  current: RecoveryCurrent,
  operationId: string,
) {
  const operation = current.operations.find((item) => item.id === operationId)!;
  const result = payoutOperationSchema.parse(operation.result);
  const plan = result.plan;
  const original = current.original!;
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  assertSettlementCapture(current);
  requireRecovery(
    result.order_id === original.order_id &&
      plan.order_id === original.order_id &&
      plan.group_id === current.group.id &&
      plan.cart_id === current.group.cart_id &&
      plan.seller_id === original.seller_id &&
      plan.payment_id === payment.id &&
      plan.payment_intent_id === payment.data.id &&
      plan.original_gross === original.gross &&
      plan.original_commission === original.commission &&
      plan.original_seller_entitlement === original.seller_entitlement,
    "El plan de liquidación difiere del original inmutable.",
  );
  const prior = current.operations.flatMap((item) => {
    const parsed = financeOperationSchema.safeParse(item.result);
    return item.state === "complete" &&
      parsed.success &&
      parsed.data.order_id === original.order_id &&
      parsed.data.settlement
      ? [parsed.data.settlement]
      : [];
  });
  const economics = verifySettlementHistory({
    gross: original.gross,
    sellerNet: original.seller_entitlement,
    refunded: plan.refunded,
    prior,
  });
  requireRecovery(
    MathBN.eq(current.view.finance.refunded_total, plan.refunded) &&
      MathBN.eq(current.view.finance.captured_total, original.gross) &&
      MathBN.eq(plan.seller_entitlement_reduced, economics.reduced) &&
      MathBN.eq(plan.commission_returned, economics.commission) &&
      MathBN.eq(
        plan.amount,
        MathBN.sub(original.seller_entitlement, economics.reduced),
      ),
    "El saldo de la liquidación cambió.",
  );
  const stripe = financeStripeClient();
  const [platform, balance, provider, transfers] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.balance.retrieve(),
    readFinanceProvider(payment.data.id),
    readOrderTransfers(stripe, {
      order_id: plan.order_id,
      transfer_group: plan.transfer_group,
      group_order_ids: current.group.orders.map((order) => order.id),
    }),
  ]);
  requireRecovery(
    platform.id === plan.platform_account_id && !balance.livemode,
    "No se pudo verificar la cuenta o todas las transferencias.",
  );
  assertProviderBalances(
    provider,
    payment.captures.reduce(
      (sum, item) => MathBN.add(sum, item.amount).toNumber(),
      0,
    ),
    payment.refunds.reduce(
      (sum, item) => MathBN.add(sum, item.amount).toNumber(),
      0,
    ),
    current.finalCapture?.released_refund_ids,
  );
  requireRecovery(
    provider.intent.status === "succeeded" &&
      idOf(provider.intent.latest_charge) === plan.source_transaction,
    "La transferencia no pertenece al cobro congelado.",
  );
  const actions: RecoveryAction[] = [];
  if (plan.amount === 0) {
    requireRecovery(
      plan.outcome === "no_transfer_required" &&
        transfers.length === 0 &&
        !current.payout &&
        !result.transfer_id &&
        !result.payout_id,
      "El plan de saldo cero contiene una transferencia.",
    );
    return {
      kind: "payout" as const,
      result,
      actions,
      transfer: undefined,
      payout: undefined,
    };
  }
  requireRecovery(
    plan.outcome === "transfer_required" && plan.account_id && plan.destination,
    "El destino congelado no está disponible.",
  );
  requireRecovery(
    transfers.length === 1,
    "La transferencia no es inequívoca. La recuperación no vuelve a transferir dinero.",
  );
  const transfer = transfers[0];
  requireRecovery(
    !transfer.livemode &&
      transfer.currency === "usd" &&
      idOf(transfer.destination) === plan.destination &&
      idOf(transfer.source_transaction) === plan.source_transaction &&
      transfer.transfer_group === plan.transfer_group &&
      transfer.metadata.finance_operation_id === operationId &&
      transfer.metadata.order_id === plan.order_id &&
      transfer.metadata.seller_id === plan.seller_id &&
      transfer.metadata.group_id === plan.group_id &&
      transfer.amount === minor(plan.amount) &&
      transfer.amount_reversed === 0 &&
      (!result.transfer_id || result.transfer_id === transfer.id),
    "La transferencia no coincide con la identidad y el importe congelados.",
  );
  const module = container.resolve<InstanceType<typeof PayoutModule.service>>(
    MercurModules.PAYOUT,
  );
  const account = await module.retrievePayoutAccount(plan.account_id);
  requireRecovery(
    account.data?.id === plan.destination,
    "La cuenta local ya no coincide con el destino congelado.",
  );
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: accounts } = await query.graph(
    {
      entity: "seller_payout_account",
      fields: ["seller_id", "payout_account_id"],
      filters: { payout_account_id: plan.account_id },
    },
    { cache: { enable: false } },
  );
  requireRecovery(
    accounts.length === 1 && accounts[0].seller_id === plan.seller_id,
    "El propietario de la cuenta no es inequívoco.",
  );
  // The native provider writes before persistence; scan the account to find an orphan's local half.
  const payouts: PayoutDTO[] = [];
  let offset = 0;
  for (;;) {
    const [page, count] = await module.listAndCountPayouts(
      { account_id: plan.account_id },
      { skip: offset, take: 100 },
    );
    payouts.push(
      ...page.filter(
        (item) => item.data?.id === transfer.id || item.id === result.payout_id,
      ),
    );
    offset += page.length;
    if (offset >= count) break;
    requireRecovery(
      page.length > 0 && offset < 10000,
      "El listado de liquidaciones no se pudo completar.",
    );
  }
  requireRecovery(
    payouts.length <= 1,
    "Hay varias liquidaciones para la misma transferencia.",
  );
  const payout = payouts[0];
  if (payout)
    requireRecovery(
      payout.data?.id === transfer.id &&
        payout.data?.transfer_group === plan.transfer_group &&
        payout.account_id === plan.account_id &&
        payout.currency_code === "usd" &&
        payout.status === "paid" &&
        MathBN.eq(payout.amount, plan.amount) &&
        (!result.payout_id || result.payout_id === payout.id),
      "La liquidación local no coincide con la transferencia.",
    );
  else {
    requireRecovery(
      !result.payout_id,
      "La liquidación registrada desapareció; requiere revisión.",
    );
    actions.push("adopt_payout");
  }
  const { data: links } = payout
    ? await query.graph(
        {
          entity: "payout_seller",
          fields: ["seller_id", "payout_id"],
          filters: { payout_id: payout.id },
        },
        { cache: { enable: false } },
      )
    : { data: [] };
  requireRecovery(
    links.length <= 1 &&
      links.every((link) => link.seller_id === plan.seller_id),
    "El enlace de la liquidación apunta a otra tienda.",
  );
  if (!links.length) actions.push("link_payout");
  return { kind: "payout" as const, result, actions, transfer, payout };
}

async function inspectRefund(current: RecoveryCurrent, operationId: string) {
  const operation = current.operations.find((item) => item.id === operationId)!;
  const result = financeOperationSchema.parse(operation.result);
  requireRecovery(
    result.action === "refund" || result.action === "cancel",
    "La captura requiere su propio plan de recuperación.",
  );
  const order = current.group.orders.find(
    (item) => item.id === result.order_id,
  )!;
  const original = current.original!;
  const amount = financeAmount(result.amount);
  requireRecovery(
    amount > 0 &&
      result.credit_amount !== undefined &&
      result.settlement?.version === 2,
    "La operación no tiene un plan recuperable de importe y crédito. No se reconstruyen históricos con la tasa actual.",
  );
  const settlement = result.settlement;
  const credit = financeAmount(result.credit_amount);
  requireRecovery(credit <= amount, "El crédito supera el importe congelado.");
  const priorOperations = current.operations.filter(
    (item) => item.id !== operationId && item.state === "complete",
  );
  const prior = priorOperations.flatMap((item) => {
    const parsed = financeOperationSchema.safeParse(item.result);
    return parsed.success &&
      parsed.data.order_id === order.id &&
      parsed.data.action !== "capture"
      ? [parsed.data]
      : [];
  });
  const refunded = prior.reduce(
    (sum, part) => MathBN.add(sum, part.amount).toNumber(),
    0,
  );
  verifySettlementHistory({
    gross: original.gross,
    sellerNet: original.seller_entitlement,
    refunded,
    prior: prior.flatMap((part) => (part.settlement ? [part.settlement] : [])),
  });
  const economics = proportionalSettlement(
    original.gross,
    original.seller_entitlement,
    refunded,
    amount,
  );
  requireRecovery(
    MathBN.eq(settlement.gross, original.gross) &&
      MathBN.eq(settlement.seller_net, original.seller_entitlement) &&
      MathBN.eq(settlementReduction(settlement), economics.seller_reversed) &&
      MathBN.eq(settlement.commission_returned, economics.commission_returned),
    "El ajuste congelado no coincide con el original y los reembolsos anteriores.",
  );
  const payment = order.cart.payment_collection.payments[0];
  assertSettlementCapture(current);
  requireRecovery(
    payment.captures.length === 1,
    "La captura local no es inequívoca.",
  );
  const stripe = financeStripeClient();
  const [provider, balance] = await Promise.all([
    readFinanceProvider(payment.data.id),
    stripe.balance.retrieve(),
  ]);
  requireRecovery(
    !balance.livemode && provider.intent.status === "succeeded",
    "El cobro no está confirmado en TEST.",
  );
  const chargeId = idOf(provider.intent.latest_charge);
  requireRecovery(chargeId, "Falta el cargo del cobro.");
  const matching = provider.refunds.filter(
    (refund) =>
      refund.metadata?.finance_operation_id === operationId ||
      refund.id === result.provider_refund_id,
  );
  requireRecovery(
    matching.length <= 1,
    "Hay varios reembolsos para esta operación.",
  );
  const refund = matching[0];
  if (refund)
    requireRecovery(
      refund.status === "succeeded" &&
        refund.currency === "usd" &&
        refund.amount === minor(amount) &&
        idOf(refund.payment_intent) === payment.data.id &&
        idOf(refund.charge) === chargeId &&
        refund.metadata?.finance_operation_id === operationId &&
        refund.metadata?.order_id === order.id &&
        (!result.provider_refund_id || result.provider_refund_id === refund.id),
      "El reembolso de Stripe no coincide con la operación.",
    );
  const native = payment.refunds.filter(
    (item) =>
      item.metadata?.finance_operation_id === operationId ||
      result.refund_ids.includes(item.id),
  );
  requireRecovery(
    native.length <= 1 &&
      native.every(
        (item) =>
          MathBN.eq(item.amount, amount) &&
          item.metadata?.finance_operation_id === operationId &&
          item.metadata?.order_id === order.id &&
          (!result.refund_ids.length || result.refund_ids.includes(item.id)),
      ),
    "El reembolso local no es inequívoco.",
  );
  requireRecovery(
    result.refund_ids.length <= 1 &&
      (!result.refund_ids.length || native.length === 1),
    "Falta un reembolso local registrado.",
  );
  const localRefund = native[0];
  requireRecovery(
    !localRefund || refund,
    "El reembolso local no tiene un efecto confirmado en Stripe.",
  );
  requireRecovery(
    refund || (result.refund_attempted === false && !result.provider_refund_id),
    "El proveedor no confirma el reembolso intentado. Su ausencia no autoriza repetir dinero.",
  );
  assertProviderBalances(
    provider,
    financeAmount(payment.captures[0].amount),
    MathBN.add(
      payment.refunds.reduce(
        (sum, item) => MathBN.add(sum, item.amount).toNumber(),
        0,
      ),
      refund && !localRefund ? amount : 0,
    ).toNumber(),
    current.finalCapture?.released_refund_ids,
  );
  let reversal: Stripe.TransferReversal | undefined;
  const plannedReversal = financeAmount(settlement.seller_reversal_amount ?? 0);
  requireRecovery(
    MathBN.eq(settlement.seller_reversed, 0) ||
      (settlement.reversal_id &&
        MathBN.eq(settlement.seller_reversed, plannedReversal)),
    "La reversión registrada difiere del importe congelado.",
  );
  const charge = await stripe.charges.retrieve(chargeId);
  requireRecovery(
    !charge.livemode &&
      charge.currency === "usd" &&
      idOf(charge.payment_intent) === payment.data.id &&
      charge.captured,
    "No se pudo verificar el cargo de origen.",
  );
  const transferGroup = charge.transfer_group || `group_${payment.data.id}`;
  const transfers = await readOrderTransfers(stripe, {
    order_id: order.id,
    transfer_group: transferGroup,
    group_order_ids: current.group.orders.map((part) => part.id),
  });
  if (settlement.transfer_id) {
    requireRecovery(
      settlement.transfer_id &&
        settlement.destination &&
        current.payout &&
        current.payout.id === settlement.payout_id,
      "La reversión no tiene una liquidación local inequívoca.",
    );
    requireRecovery(
      transfers.length === 1 && transfers[0].id === settlement.transfer_id,
      "Hay otra transferencia sin conciliar.",
    );
    const transfer = transfers[0];
    const reversals = await readStripeFactPages(
      (cursor) =>
        stripe.transfers.listReversals(settlement.transfer_id!, {
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        }),
      100,
    );
    const beforeTransfer = prior.reduce(
      (sum, part) =>
        MathBN.add(
          sum,
          part.settlement?.transfer_id
            ? 0
            : settlementReduction(part.settlement!),
        ).toNumber(),
      0,
    );
    requireRecovery(
      MathBN.eq(plannedReversal, economics.seller_reversed) &&
        !transfer.livemode &&
        transfer.currency === "usd" &&
        [order.id, transferGroup].includes(transfer.transfer_group ?? "") &&
        (!settlement.transfer_group ||
          settlement.transfer_group === transfer.transfer_group) &&
        idOf(transfer.destination) === settlement.destination &&
        transfer.metadata.seller_id === original.seller_id &&
        idOf(transfer.source_transaction) === chargeId &&
        current.payout.account.data.id === settlement.destination &&
        transfer.amount ===
          minor(
            MathBN.sub(original.seller_entitlement, beforeTransfer).toNumber(),
          ) &&
        MathBN.eq(
          current.payout.amount,
          MathBN.sub(original.seller_entitlement, beforeTransfer),
        ) &&
        current.payout.data.id === transfer.id &&
        reversals.complete,
      "La transferencia de origen no coincide con la reversión.",
    );
    const matches = reversals.data.filter(
      (item) =>
        item.metadata?.finance_operation_id === operationId ||
        item.id === settlement.reversal_id,
    );
    requireRecovery(
      matches.length === (plannedReversal > 0 ? 1 : 0),
      "La reversión no está confirmada de forma inequívoca; no se repite automáticamente.",
    );
    reversal = matches[0];
    if (reversal)
      requireRecovery(
        reversal.amount === minor(plannedReversal) &&
          reversal.currency === "usd" &&
          idOf(reversal.transfer) === transfer.id &&
          reversal.metadata?.finance_operation_id === operationId &&
          reversal.metadata?.order_id === order.id &&
          (!settlement.reversal_id || settlement.reversal_id === reversal.id),
        "La reversión no coincide con el plan congelado.",
      );
    const knownIds = prior.flatMap((part) =>
      part.settlement?.reversal_id ? [part.settlement.reversal_id] : [],
    );
    requireRecovery(
      reversals.data.length === knownIds.length + matches.length &&
        reversals.data.every((part) => {
          if (part.id === reversal?.id) return true;
          const previous = prior.find(
            (value) => value.settlement?.reversal_id === part.id,
          );
          const previousOperation = priorOperations.find(
            (item) =>
              financeOperationSchema.safeParse(item.result).success &&
              financeOperationSchema.parse(item.result).settlement
                ?.reversal_id === part.id,
          );
          return (
            previous?.settlement &&
            part.amount === minor(previous.settlement.seller_reversed) &&
            part.currency === "usd" &&
            idOf(part.transfer) === transfer.id &&
            part.metadata?.order_id === order.id &&
            part.metadata?.finance_operation_id === previousOperation?.id
          );
        }) &&
        transfer.amount_reversed ===
          reversals.data.reduce((sum, part) => sum + part.amount, 0),
      "Hay reversiones externas sin conciliar.",
    );
  } else
    requireRecovery(
      transfers.length === 0 &&
        plannedReversal === 0 &&
        !settlement.reversal_id &&
        financeAmount(settlement.seller_reversed) === 0,
      "El ajuste sin transferencia contiene una reversión.",
    );
  const actions: RecoveryAction[] = [];
  const ownCaptured =
    current.finalCapture?.orders.find((part) => part.order_id === order.id)
      ?.amount ?? original.gross;
  if (
    !hasRecoveryTransaction(
      order,
      "capture",
      payment.captures[0].id,
      financeAmount(ownCaptured),
    )
  )
    actions.push("record_capture_transaction");
  if (!localRefund) actions.push(refund ? "adopt_refund" : "create_refund");
  if (
    !localRefund ||
    !hasRecoveryTransaction(order, "refund", localRefund.id, -amount)
  )
    actions.push("record_refund_transaction");
  if (localRefund) {
    if (!hasRecoveryCredit(order, localRefund.id, credit) && credit > 0)
      actions.push("create_credit_line");
  } else if (credit > 0) actions.push("create_credit_line");
  if (result.action === "cancel" && order.status !== "canceled") {
    requireRecovery(
      order.status === "pending" &&
        !order.fulfillments.some((part) => !part.canceled_at),
      "El pedido no permite completar la cancelación.",
    );
    actions.push("cancel_order");
  }
  return {
    kind: "refund" as const,
    result,
    actions,
    refund,
    localRefund,
    reversal,
  };
}

async function inspectCancellationAfterRefund(
  current: RecoveryCurrent,
  operationId: string,
) {
  const operation = current.operations.find((item) => item.id === operationId)!;
  const result = financeOperationSchema.parse(operation.result);
  const order = current.group.orders.find(
    (item) => item.id === result.order_id,
  );
  const original = current.original!;
  requireRecovery(
    order &&
      order.id === original.order_id &&
      result.action === "cancel" &&
      financeAmount(result.amount) === 0 &&
      result.refund_ids.length === 0 &&
      !result.provider_refund_id &&
      !result.settlement &&
      !result.capture_orders &&
      !result.capture_evidence &&
      result.refund_attempted === false &&
      result.reversal_attempted === false &&
      result.capture_attempted === false &&
      result.cancel_authorization_attempted === false &&
      (result.credit_amount === undefined ||
        financeAmount(result.credit_amount) === 0),
    "La cancelación sin importe contiene un efecto financiero pendiente.",
  );
  requireRecovery(
    !current.financialProblem &&
      ["pending", "canceled"].includes(order.status) &&
      order.fulfillments.every((part) => part.canceled_at),
    "El pedido o sus finanzas no permiten completar la cancelación.",
  );
  assertSettlementCapture(current);
  const payment = order.cart.payment_collection.payments[0];
  const completed = current.operations.flatMap((item) => {
    if (item.id === operationId || item.state !== "complete") return [];
    const parsed = financeOperationSchema.safeParse(item.result);
    return parsed.success &&
      ["refund", "cancel"].includes(parsed.data.action) &&
      financeAmount(parsed.data.amount) > 0
      ? [{ id: item.id, result: parsed.data }]
      : [];
  });
  const ownRefunds = completed.filter(
    (item) => item.result.order_id === order.id,
  );
  const refunded = ownRefunds.reduce(
    (sum, item) => MathBN.add(sum, item.result.amount).toNumber(),
    0,
  );
  requireRecovery(
    MathBN.eq(refunded, original.gross) &&
      hasRecoveryTransaction(
        order,
        "capture",
        payment.captures[0].id,
        original.gross,
      ),
    "El pedido no tiene un reembolso total y un cobro local verificados.",
  );
  for (const { result: previous } of ownRefunds) {
    requireRecovery(
      previous.refund_ids.length === 1 &&
        previous.credit_amount !== undefined &&
        previous.settlement?.version === 2 &&
        MathBN.lte(previous.credit_amount, previous.amount) &&
        payment.refunds.some(
          (refund) =>
            refund.id === previous.refund_ids[0] &&
            MathBN.eq(refund.amount, previous.amount),
        ) &&
        hasRecoveryTransaction(
          order,
          "refund",
          previous.refund_ids[0],
          -financeAmount(previous.amount),
        ) &&
        (hasRecoveryCredit(
          order,
          previous.refund_ids[0],
          financeAmount(previous.credit_amount),
        ) ||
          financeAmount(previous.credit_amount) === 0),
      "El reembolso anterior conserva pasos locales sin verificar.",
    );
  }
  const provider = await readFinanceProvider(payment.data.id);
  requireRecovery(
    provider.intent.status === "succeeded",
    "El proveedor no confirma el cobro de esta compra.",
  );
  assertProviderBalances(
    provider,
    financeAmount(payment.captures[0].amount),
    payment.refunds.reduce(
      (sum, refund) => MathBN.add(sum, refund.amount).toNumber(),
      0,
    ),
    current.finalCapture?.released_refund_ids,
  );
  const providerRefunds = provider.refunds.filter(
    (refund) => !current.finalCapture?.released_refund_ids.includes(refund.id),
  );
  requireRecovery(
    providerRefunds.length === payment.refunds.length &&
      payment.refunds.every((refund) => {
        const matches = completed.filter((item) =>
          item.result.refund_ids.includes(refund.id),
        );
        if (matches.length !== 1) return false;
        const previous = matches[0];
        return (
          previous.result.refund_ids.length === 1 &&
          MathBN.eq(refund.amount, previous.result.amount) &&
          refund.metadata?.finance_operation_id === previous.id &&
          refund.metadata?.order_id === previous.result.order_id &&
          providerRefunds.filter(
            (part) =>
              part.id === previous.result.provider_refund_id &&
              part.metadata?.finance_operation_id === previous.id &&
              part.metadata?.order_id === previous.result.order_id &&
              part.currency === "usd" &&
              part.amount === minor(refund.amount) &&
              idOf(part.payment_intent) === payment.data.id &&
              idOf(part.charge) === idOf(provider.intent.latest_charge),
          ).length === 1
        );
      }),
    "Los reembolsos de la compra no tienen una atribución verificada.",
  );
  // Inspect the existing settlement at zero additional money; recovery only cancels the order.
  await prepareSettlement({
    payout: current.payout,
    orderId: order.id,
    sellerId: order.seller.id,
    gross: original.gross,
    sellerNet: original.seller_entitlement,
    refunded,
    amount: 0,
    paymentIntentId: payment.data.id,
    chargeId: idOf(provider.intent.latest_charge),
    groupOrderIds: current.group.orders.map((part) => part.id),
    prior: ownRefunds.map((item) => item.result.settlement!),
  });
  const actions: RecoveryAction[] =
    order.status === "canceled" ? [] : ["cancel_order"];
  return {
    kind: "cancellation" as const,
    result,
    actions,
    payment_id: payment.id,
    capture_id: payment.captures[0].id,
    native_refund_ids: payment.refunds.map((refund) => refund.id),
    provider_refund_ids: providerRefunds.map((refund) => refund.id),
  };
}

export async function inspectFinanceRecovery(
  container: MedusaContainer,
  rawInput: RecoveryInput,
) {
  const input = recoveryInputSchema.parse(rawInput);
  await requireFinanceOperator(container, input.actor_id);
  const current = await readOrderFinance(container, input.order_id, {
    actor_id: input.actor_id,
  });
  const operation = current.operations.find(
    (item) => item.id === input.operation_id,
  );
  requireRecovery(
    operation &&
      ["payout", "refund", "cancel", "capture"].includes(operation.kind),
    "No hay una operación recuperable para este pedido.",
  );
  requireRecovery(
    current.original && !current.originalProblem && !current.hasPendingChanges,
    "El original o una modificación pendiente impide conciliar.",
  );
  requireRecovery(
    current.state?.active_token === operation.token &&
      current.operations.every(
        (item) => item.id === operation.id || item.state === "complete",
      ),
    "La compra contiene otro propietario u operaciones pendientes.",
  );
  const prepared =
    operation.kind === "payout"
      ? await inspectPayout(container, current, operation.id)
      : operation.kind === "capture" ||
          (operation.kind === "cancel" &&
            financeAmount(
              financeOperationSchema.parse(operation.result).amount,
            ) === 0)
        ? operation.kind === "cancel" &&
          current.group.orders[0].cart.payment_collection.payments[0].captures
            .length > 0
          ? await inspectCancellationAfterRefund(current, operation.id)
          : await inspectAuthorizationRecovery(current, operation.id)
        : await inspectRefund(current, operation.id);
  requireRecovery(
    prepared.result.order_id === input.order_id,
    "La operación pertenece a otro pedido.",
  );
  if (operation.state === "complete")
    requireRecovery(
      prepared.actions.length === 0,
      "Una operación completa tiene pasos faltantes; no se libera su bloqueo.",
    );
  const observation =
    prepared.kind === "payout"
      ? {
          transfer_id: prepared.transfer?.id ?? null,
          payout_id: prepared.payout?.id ?? null,
        }
      : prepared.kind === "authorization"
        ? {
            payment_id: prepared.payment_id,
            charge_id: prepared.charge_id,
            capture_id: prepared.capture_id,
            provider_status: prepared.provider_status,
            released_refund_ids: prepared.released_refund_ids,
            capture_orders: prepared.capture_orders,
          }
        : prepared.kind === "cancellation"
          ? {
              payment_id: prepared.payment_id,
              capture_id: prepared.capture_id,
              native_refund_ids: prepared.native_refund_ids,
              provider_refund_ids: prepared.provider_refund_ids,
            }
          : {
              refund_id: prepared.refund?.id ?? null,
              native_refund_id: prepared.localRefund?.id ?? null,
              reversal_id: prepared.reversal?.id ?? null,
            };
  const plan = {
    version: 1,
    operation_id: operation.id,
    order_id: input.order_id,
    state: operation.state,
    actions: prepared.actions,
    provider: "stripe",
    mode: "test",
    observation,
  };
  const planHash = createHash("sha256")
    .update(
      JSON.stringify({
        plan,
        result: operation.result,
        token: operation.token,
      }),
    )
    .digest("hex");
  return { current, operation, prepared, plan, plan_hash: planHash };
}
