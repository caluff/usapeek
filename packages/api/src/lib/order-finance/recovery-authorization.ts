import { cancelOrderWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import type { CommerceOperationRecord } from "../../modules/commerce-automation/service";
import {
  cancelSharedAuthorizationWorkflow,
  closeSharedCollectionWorkflow,
  recordAllocatedRefundWorkflow,
  recordFinalCaptureWorkflow,
} from "../../workflows/order-finance-native";
import {
  financeAmount,
  financeGroupSchema,
  financeOperationSchema,
  type FinanceOperation,
  type FinalCapture,
} from "./policy";
import {
  assertProviderBalances,
  financeStripeClient,
  readFinanceProvider,
} from "./provider";
import { readOrderFinance } from "./read";
import { freezeFinalCaptureAllocation, splitFinalOrderCapture } from "../../workflows/steps/split-final-order-capture";
import { CAPTURE_ALLOCATION_METADATA_KEY } from "./native-payments";

type Current = Awaited<ReturnType<typeof readOrderFinance>>;
type Order = Current["group"]["orders"][number];
export type AuthorizationRecoveryAction =
  | "adopt_capture"
  | "record_capture_transaction"
  | "record_final_capture"
  | "cancel_order"
  | "cancel_authorization"
  | "adopt_authorization_cancel"
  | "close_payment_collection";

export type PreparedAuthorizationRecovery = {
  kind: "authorization";
  result: FinanceOperation;
  actions: AuthorizationRecoveryAction[];
  payment_id: string;
  collection_id: string;
  intent_id: string;
  charge_id: string | null;
  capture_id: string | null;
  capture_orders: FinalCapture["orders"];
  released_refund_ids: string[];
  missing_capture_orders: string[];
  all_canceled: boolean;
  provider_status: "succeeded" | "requires_capture" | "canceled";
};

function requireEvidence(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message);
}
function referenceId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}
const minor = (amount: Parameters<typeof financeAmount>[0]) =>
  MathBN.mult(financeAmount(amount), 100).toNumber();

function equalAllocations(
  left: FinalCapture["orders"],
  right: FinalCapture["orders"],
) {
  return (
    left.length === right.length &&
    new Set(left.map((part) => part.order_id)).size === left.length &&
    left.every((part) =>
      right.some(
        (other) =>
          other.order_id === part.order_id &&
          MathBN.eq(other.amount, part.amount),
      ),
    )
  );
}

function missingCapture(
  order: Order,
  captureId: string | null,
  amount: number,
) {
  const captures = order.transactions.filter(
    (transaction) => transaction.reference === "capture",
  );
  requireEvidence(
    !order.transactions.some(
      (transaction) => transaction.reference === "refund",
    ),
    "El pedido tiene una devolución incompatible con esta captura.",
  );
  requireEvidence(
    captures.length <= 1 &&
      captures.every(
        (record) =>
          captureId &&
          amount > 0 &&
          record.reference_id === captureId &&
          record.currency_code === "usd" &&
          MathBN.eq(record.amount, amount),
      ),
    "La transacción de captura no coincide con el reparto congelado.",
  );
  return amount > 0 && captures.length === 0;
}

async function authorizationProvider(current: Current) {
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  const stripe = financeStripeClient();
  const [provider, balance] = await Promise.all([
    readFinanceProvider(payment.data.id),
    stripe.balance.retrieve(),
  ]);
  const intent = provider.intent;
  requireEvidence(
    !balance.livemode &&
      !intent.livemode &&
      intent.id === payment.data.id &&
      intent.currency === "usd" &&
      intent.capture_method === "manual" &&
      intent.amount === minor(payment.amount),
    "El proveedor no confirma la autorización compartida en USD y TEST.",
  );
  const chargeId = referenceId(intent.latest_charge);
  const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
  if (charge)
    requireEvidence(
      charge.id === chargeId &&
        !charge.livemode &&
        charge.currency === "usd" &&
        referenceId(charge.payment_intent) === intent.id &&
        charge.amount === intent.amount,
      "El cargo no pertenece a la autorización original.",
    );
  requireEvidence(
    provider.refunds.every(
      (refund) =>
        refund.status === "succeeded" &&
        refund.currency === "usd" &&
        referenceId(refund.payment_intent) === intent.id &&
        referenceId(refund.charge) === chargeId &&
        !refund.metadata?.finance_operation_id,
    ),
    "Hay un reembolso que no es una liberación verificada de autorización.",
  );
  if (charge)
    requireEvidence(
      charge.amount_refunded ===
        provider.refunds.reduce((sum, refund) => sum + refund.amount, 0),
      "El cargo y sus reembolsos no tienen una observación consistente.",
    );
  return { provider, charge };
}

export async function inspectAuthorizationRecovery(
  current: Current,
  operationId: string,
): Promise<PreparedAuthorizationRecovery> {
  const operation = current.operations.find((item) => item.id === operationId);
  requireEvidence(operation, "No existe la operación de autorización.");
  const result = financeOperationSchema.parse(operation.result);
  requireEvidence(
    operation.kind === result.action &&
      (result.action === "capture" ||
        (result.action === "cancel" && financeAmount(result.amount) === 0)),
    "La operación no es una captura o cancelación previa al cobro.",
  );
  const order = current.group.orders.find(
    (item) => item.id === result.order_id,
  );
  requireEvidence(
    order && !current.originalProblem && !current.hasPendingChanges,
    "El pedido original o sus modificaciones requieren revisión.",
  );
  const collection = order.cart.payment_collection;
  const payment = collection.payments[0];
  requireEvidence(
    payment &&
      collection.payments.length === 1 &&
      payment.provider_id === "pp_stripe_stripe" &&
      !payment.data.livemode &&
      current.allocation.payment_id === payment.id &&
      current.allocation.currency_code === "usd" &&
      current.group.orders.every(
        (part) =>
          part.payment_collections.length === 0 &&
          part.cart.id === current.group.cart_id &&
          part.cart.payment_collection.id === collection.id &&
          part.cart.payment_collection.payments.length === 1 &&
          part.cart.payment_collection.payments[0].id === payment.id &&
          part.cart.payment_collection.payments[0].data.id === payment.data.id,
      ),
    "La compra no tiene una autorización nativa compartida inequívoca.",
  );
  requireEvidence(
    current.originals.length === current.group.orders.length &&
      current.allocation.orders.length === current.group.orders.length &&
      new Set(current.allocation.orders.map((part) => part.order_id)).size ===
        current.group.orders.length &&
      current.allocation.orders.every((part) =>
        current.originals.some(
          (original) =>
            original.order_id === part.order_id &&
            original.group_id === current.group.id &&
            original.cart_id === current.group.cart_id &&
            original.allocation.payment_collection_id === collection.id &&
            original.allocation.payment_session_id ===
              payment.payment_session_id &&
            MathBN.eq(original.gross, part.amount),
        ),
      ) &&
      MathBN.eq(
        payment.amount,
        current.allocation.orders.reduce(
          (sum, part) => MathBN.add(sum, part.amount).toNumber(),
          0,
        ),
      ),
    "La autorización no coincide con los originales inmutables.",
  );
  requireEvidence(
    payment.refunds.length === 0 &&
      result.refund_ids.length === 0 &&
      !result.provider_refund_id &&
      !result.settlement &&
      (result.credit_amount === undefined ||
        financeAmount(result.credit_amount) === 0),
    "La operación contiene ajustes de dinero incompatibles con una autorización.",
  );
  const { provider, charge } = await authorizationProvider(current);
  const actions: AuthorizationRecoveryAction[] = [];
  const base = {
    kind: "authorization" as const,
    result,
    actions,
    payment_id: payment.id,
    collection_id: collection.id,
    intent_id: provider.intent.id,
    charge_id: charge?.id ?? null,
    capture_id: null,
    capture_orders: [],
    released_refund_ids: [],
    missing_capture_orders: [],
    all_canceled: false,
  };
  if (result.action === "capture") {
    const amount = financeAmount(result.amount);
    const orders = result.capture_orders;
    requireEvidence(
      amount > 0 &&
        orders &&
        equalAllocations(
          orders,
          current.allocation.orders.map((part) => ({
            order_id: part.order_id,
            amount:
              current.group.orders.find((value) => value.id === part.order_id)
                ?.status === "canceled"
                ? 0
                : financeAmount(part.amount),
          })),
        ) &&
        MathBN.eq(
          amount,
          orders.reduce(
            (sum, part) => MathBN.add(sum, part.amount).toNumber(),
            0,
          ),
        ),
      "El reparto de captura congelado cambió o no conserva el importe.",
    );
    requireEvidence(
      !payment.canceled_at &&
        provider.intent.status === "succeeded" &&
        provider.intent.amount_capturable === 0 &&
        provider.intent.amount_received === minor(amount) &&
        provider.intent.metadata?.marketplace_final_capture_operation_id ===
          operationId &&
        charge?.paid &&
        charge.captured &&
        charge.amount_captured === minor(amount),
      "Stripe no confirma la captura de esta operación. La recuperación nunca vuelve a capturar.",
    );
    requireEvidence(
      payment.captures.length <= 1 &&
        payment.captures.every(
          (capture) => capture.id && MathBN.eq(capture.amount, amount),
        ),
      "La captura nativa no es única o tiene otro importe.",
    );
    const captureId = payment.captures[0]?.id ?? null;
    const final = current.finalCapture;
    const evidence = result.capture_evidence;
    if (evidence)
      requireEvidence(
        evidence.payment_intent_id === provider.intent.id &&
          evidence.charge_id === charge.id &&
          MathBN.eq(evidence.amount, amount) &&
          equalAllocations(evidence.orders, orders),
        "La evidencia persistida de captura difiere del plan o de las referencias verificadas.",
      );
    if (final)
      requireEvidence(
        captureId &&
          final.capture_id === captureId &&
          equalAllocations(final.orders, orders),
        "El cierre de captura registrado difiere de su plan congelado.",
      );
    requireEvidence(
      final || evidence || provider.refunds.length === 0,
      "Faltan las identidades verificadas de la liberación parcial. No se deducen por importe.",
    );
    const releasedIds =
      evidence?.released_refund_ids ?? final?.released_refund_ids ?? [];
    if (final && evidence)
      requireEvidence(
        new Set(final.released_refund_ids).size ===
          final.released_refund_ids.length &&
          final.released_refund_ids.length === releasedIds.length &&
          final.released_refund_ids.every((id) => releasedIds.includes(id)),
        "La evidencia de liberación y el cierre registrado contienen referencias distintas.",
      );
    requireEvidence(
      new Set(releasedIds).size === releasedIds.length &&
        provider.refunds.length === releasedIds.length &&
        provider.refunds.every((refund) => releasedIds.includes(refund.id)),
      "Hay reembolsos sin conciliar en la captura.",
    );
    assertProviderBalances(provider, amount, 0, releasedIds);
    const missingOrders = orders
      .filter((part) =>
        missingCapture(
          current.group.orders.find((value) => value.id === part.order_id)!,
          captureId,
          financeAmount(part.amount),
        ),
      )
      .map((part) => part.order_id);
    if (!captureId) actions.push("adopt_capture");
    if (missingOrders.length) actions.push("record_capture_transaction");
    if (!final) actions.push("record_final_capture");
    return {
      ...base,
      capture_id: captureId,
      capture_orders: orders,
      released_refund_ids: releasedIds,
      missing_capture_orders: missingOrders,
      provider_status: "succeeded",
    };
  }
  requireEvidence(
    payment.captures.length === 0 &&
      !current.finalCapture &&
      !result.capture_orders &&
      !result.capture_evidence &&
      ["pending", "canceled"].includes(order.status) &&
      order.items !== undefined &&
      order.items.every((item) =>
        MathBN.eq(item.detail.fulfilled_quantity, 0),
      ) &&
      order.fulfillments.every((fulfillment) => fulfillment.canceled_at) &&
      current.group.orders.every(
        (part) =>
          !part.transactions.some((transaction) =>
            ["capture", "refund"].includes(transaction.reference),
          ),
      ),
    "El pedido o pago ya tiene captura, actividad logística o contable que impide la cancelación previa al cobro.",
  );
  requireEvidence(
    ["requires_capture", "canceled"].includes(provider.intent.status) &&
      provider.intent.amount_received === 0 &&
      (!charge || (!charge.captured && charge.amount_captured === 0)),
    "La autorización ya produjo un cobro o tiene un estado ambiguo.",
  );
  assertProviderBalances(provider, 0, 0);
  const allCanceled = current.group.orders.every(
    (part) => part.id === order.id || part.status === "canceled",
  );
  if (order.status !== "canceled") actions.push("cancel_order");
  if (provider.intent.status === "requires_capture") {
    requireEvidence(
      charge &&
        provider.intent.amount_capturable === provider.intent.amount &&
        provider.refunds.length === 0 &&
        !payment.canceled_at &&
        collection.status !== "canceled",
      "La autorización pendiente no conserva su estado original.",
    );
    if (allCanceled) {
      requireEvidence(
        result.cancel_authorization_attempted === false,
        "No está confirmado el resultado de la anulación intentada. No se vuelve a enviar al proveedor.",
      );
      actions.push("cancel_authorization");
    }
  } else {
    requireEvidence(
      allCanceled && provider.intent.amount_capturable === 0,
      "Una autorización anulada conserva pedidos activos.",
    );
    if (!payment.canceled_at) actions.push("adopt_authorization_cancel");
  }
  if (allCanceled && collection.status !== "canceled")
    actions.push("close_payment_collection");
  return {
    ...base,
    all_canceled: allCanceled,
    provider_status: provider.intent.status as "requires_capture" | "canceled",
    released_refund_ids: provider.refunds.map((refund) => refund.id),
  };
}

// Called only from the recovery workflow while it owns both the writer lock and journal token.
export async function executeAuthorizationRecovery(
  container: MedusaContainer,
  input: {
    current: Current;
    operation: Pick<CommerceOperationRecord, "id" | "state">;
    prepared: PreparedAuthorizationRecovery;
    actor_id: string;
    token: string;
    checkpoint: (result: FinanceOperation) => Promise<void>;
  },
): Promise<FinanceOperation> {
  const { current, prepared } = input;
  const result = structuredClone(prepared.result);
  if (result.action === "capture") {
    const useNativeSplit = current.nativeSplit ||
      current.group.orders[0].cart.payment_collection.metadata?.[CAPTURE_ALLOCATION_METADATA_KEY] !== undefined ||
      current.group.orders.every((order) => !order.transactions.some((transaction) => transaction.reference === "capture"));
    if (useNativeSplit) await freezeFinalCaptureAllocation(container, current, prepared.capture_orders);
    let captureId = prepared.capture_id;
    if (prepared.actions.includes("adopt_capture")) {
      const { result: updated } = await recordFinalCaptureWorkflow(
        container,
      ).run({
        input: {
          payment_id: prepared.payment_id,
          amount: financeAmount(result.amount),
          is_captured: true,
          captured_by: input.actor_id,
        },
      });
      const captures =
        financeGroupSchema.shape.orders.element.shape.cart.shape.payment_collection.shape.payments.element.shape.captures.parse(
          updated.captures,
        );
      requireEvidence(
        updated.id === prepared.payment_id &&
          captures.length === 1 &&
          MathBN.eq(captures[0].amount, result.amount),
        "La captura adoptada no confirmó su identidad e importe.",
      );
      captureId = captures[0].id;
    }
    requireEvidence(captureId, "Falta la captura local verificada.");
    if (input.operation.state !== "complete") {
      result.capture_attempted = true;
      await input.checkpoint(result);
    }
    if (useNativeSplit) await splitFinalOrderCapture(container, {
      current, orders: prepared.capture_orders, captureId, actorId: input.actor_id, token: input.token,
    });
    else for (const part of prepared.capture_orders) {
      if (!prepared.missing_capture_orders.includes(part.order_id)) continue;
      await recordAllocatedRefundWorkflow(container).run({
        input: {
          order_id: part.order_id,
          amount: financeAmount(part.amount),
          currency_code: "usd",
          reference: "capture",
          reference_id: captureId,
        },
      });
    }
    if (prepared.actions.includes("record_final_capture")) {
      await current.journal.observeGroup(
        current.group.id,
        input.token,
        {
          finance_final_capture: {
            capture_id: captureId,
            orders: prepared.capture_orders,
            released_refund_ids: prepared.released_refund_ids,
          },
        },
        Boolean(current.state?.review_required),
      );
    }
    return result;
  }
  if (prepared.actions.includes("cancel_order")) {
    await cancelOrderWorkflow(container).run({
      input: { order_id: result.order_id, canceled_by: input.actor_id },
    });
  }
  let fresh = await readOrderFinance(
    container,
    result.order_id,
    { actor_id: input.actor_id },
    input.token,
  );
  let checked = await inspectAuthorizationRecovery(fresh, input.operation.id);
  requireEvidence(
    !checked.actions.includes("cancel_order"),
    "La cancelación nativa del pedido no quedó registrada.",
  );
  if (
    checked.actions.includes("cancel_authorization") ||
    checked.actions.includes("adopt_authorization_cancel")
  ) {
    result.cancel_authorization_attempted = true;
    await input.checkpoint(result);
    await cancelSharedAuthorizationWorkflow(container).run({
      input: { payment_id: prepared.payment_id },
    });
    fresh = await readOrderFinance(
      container,
      result.order_id,
      { actor_id: input.actor_id },
      input.token,
    );
    checked = await inspectAuthorizationRecovery(fresh, input.operation.id);
    const payment = fresh.group.orders[0].cart.payment_collection.payments[0];
    requireEvidence(
      checked.provider_status === "canceled" && payment.canceled_at,
      "La anulación compartida no quedó confirmada en Stripe y Medusa.",
    );
  }
  if (checked.actions.includes("close_payment_collection")) {
    requireEvidence(
      checked.provider_status === "canceled" &&
        fresh.group.orders[0].cart.payment_collection.payments[0].canceled_at,
      "No se cierra una colección sin anulación nativa confirmada.",
    );
    await closeSharedCollectionWorkflow(container).run({
      input: { collection_id: prepared.collection_id },
    });
  }
  return result;
}
