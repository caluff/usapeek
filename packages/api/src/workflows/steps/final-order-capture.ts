import { isStripeLivemode } from "../../lib/stripe-mode";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import {
  financeAmount,
  captureEvidenceSchema,
  type CaptureEvidence,
  type FinalCapture,
} from "../../lib/order-finance/policy";
import {
  assertProviderBalances,
  verifiedFinanceStripeClient,
  readFinanceProvider,
} from "../../lib/order-finance/provider";
import type { readOrderFinance } from "../../lib/order-finance/read";
import { recordFinalCaptureWorkflow } from "../order-finance-native";
import {
  freezeFinalCaptureAllocation,
  splitFinalOrderCapture,
} from "./split-final-order-capture";

// Called only by the owning finance step after its durable operation is committed.
export async function performFinalOrderCapture(
  container: MedusaContainer,
  input: {
    current: Awaited<ReturnType<typeof readOrderFinance>>;
    token: string;
    operationId: string;
    actorId: string;
    persistEvidence?: (evidence: CaptureEvidence) => Promise<void>;
  },
) {
  const { current, token, operationId } = input;
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  const amount = current.view.finance.capture.amount;
  const orders = current.allocation.orders.map((part) => ({
    order_id: part.order_id,
    amount:
      current.group.orders.find((order) => order.id === part.order_id)
        ?.status === "canceled"
        ? 0
        : financeAmount(part.amount),
  }));
  if (
    !MathBN.eq(
      amount,
      orders.reduce((sum, part) => MathBN.add(sum, part.amount).toNumber(), 0),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El reparto congelado no conserva el importe de captura.",
    );
  }
  await freezeFinalCaptureAllocation(container, current, orders);
  const stripe = await verifiedFinanceStripeClient();
  const intent = await stripe.paymentIntents.capture(
    payment.data.id,
    {
      amount_to_capture: MathBN.mult(amount, 100).toNumber(),
      // Ordinary manual payments support one capture and release the remainder.
      // Passing final_capture explicitly requires Stripe multicapture support.
      metadata: { marketplace_final_capture_operation_id: operationId },
    },
    { idempotencyKey: `order-finance:${operationId}:single-capture` },
  );
  if (
    intent.id !== payment.data.id ||
    intent.currency !== "usd" ||
    intent.capture_method !== "manual" ||
    !MathBN.eq(intent.amount, MathBN.mult(payment.amount, 100)) ||
    intent.metadata?.marketplace_final_capture_operation_id !== operationId ||
    !isStripeLivemode(intent.livemode) ||
    intent.status !== "succeeded" ||
    intent.amount_capturable !== 0 ||
    !MathBN.eq(intent.amount_received, MathBN.mult(amount, 100))
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Stripe no confirmó el importe final de la captura.",
    );
  }
  const provider = await readFinanceProvider(payment.data.id);
  const chargeId =
    typeof provider.intent.latest_charge === "string"
      ? provider.intent.latest_charge
      : provider.intent.latest_charge?.id;
  const capturedChargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : intent.latest_charge?.id;
  if (
    !chargeId ||
    chargeId !== capturedChargeId ||
    provider.intent.id !== payment.data.id ||
    !isStripeLivemode(provider.intent.livemode) ||
    provider.intent.currency !== "usd" ||
    provider.intent.status !== "succeeded" ||
    provider.intent.capture_method !== "manual" ||
    !MathBN.eq(provider.intent.amount, intent.amount) ||
    provider.intent.amount_capturable !== 0 ||
    provider.intent.metadata?.marketplace_final_capture_operation_id !==
      operationId ||
    !MathBN.eq(provider.intent.amount_received, MathBN.mult(amount, 100)) ||
    provider.refunds.some(
      (refund) =>
        refund.status !== "succeeded" ||
        refund.currency !== "usd" ||
        (typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id) !== payment.data.id ||
        (typeof refund.charge === "string"
          ? refund.charge
          : refund.charge?.id) !== chargeId ||
        Boolean(refund.metadata?.finance_operation_id),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Stripe no confirmó las referencias de captura y liberación.",
    );
  }
  // Stripe API versions before Basil represent the uncaptured remainder as a
  // Refund. Record its exact IDs now, before any actual customer refund exists.
  const releasedIds = provider.refunds.map((refund) => refund.id);
  assertProviderBalances(provider, amount, 0, releasedIds);
  const evidence = captureEvidenceSchema.parse({
    payment_intent_id: payment.data.id,
    charge_id: chargeId,
    amount,
    released_refund_ids: releasedIds,
    orders,
  });
  // Persist provider evidence before any native/accounting write can fail. A
  // later recovery must use these exact identities, never a same-amount refund.
  await input.persistEvidence?.(structuredClone(evidence));
  const { result } = await recordFinalCaptureWorkflow(container).run({
    input: {
      payment_id: payment.id,
      amount,
      is_captured: true,
      captured_by: input.actorId,
    },
  });
  if (
    result.id !== payment.id ||
    result.captures?.length !== 1 ||
    !result.captures[0].id ||
    !MathBN.eq(result.captures[0].amount, amount)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La captura registrada requiere conciliación.",
    );
  const capture: FinalCapture = {
    capture_id: result.captures[0].id,
    released_refund_ids: evidence.released_refund_ids,
    orders: evidence.orders,
  };
  await splitFinalOrderCapture(container, {
    current,
    orders,
    captureId: capture.capture_id,
    actorId: input.actorId,
    token,
  });
  await current.journal.observeGroup(
    current.group.id,
    token,
    { finance_final_capture: capture },
    false,
  );
}
