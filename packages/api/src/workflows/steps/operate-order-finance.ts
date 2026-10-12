import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { cancelOrderWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import {
  orderFinanceInputSchema,
  type OrderFinanceInput,
} from "../../lib/order-finance/contracts";
import {
  financeAmount,
  financeOperationSchema,
  type FinanceOperation,
} from "../../lib/order-finance/policy";
import {
  readOrderFinance,
  type FinanceActor,
} from "../../lib/order-finance/read";
import {
  assertProviderBalances,
  readFinanceProvider,
} from "../../lib/order-finance/provider";
import {
  cancelSharedAuthorizationWorkflow,
  closeSharedCollectionWorkflow,
  createOrderCreditLinesWorkflow,
  recordAllocatedRefundWorkflow,
  refundAllocatedPaymentWorkflow,
} from "../order-finance-native";
import {
  prepareSettlement,
  reverseSettlement,
} from "../../lib/order-finance/settlement";
import { performFinalOrderCapture } from "./final-order-capture";
import { withFinanceExecutionLock } from "../../lib/order-finance/execution-lock";
import { recordOrderFinanceProviderFacts } from "../../lib/order-finance/record-provider-facts";
import { assertAutomaticCaptureSettings } from "../../lib/order-finance/capture-settings";

export type OperateOrderFinanceInput = OrderFinanceInput &
  FinanceActor & { order_id: string; automatic_capture_revision?: string };

export async function operateOrderFinance(
  container: MedusaContainer,
  input: OperateOrderFinanceInput,
) {
  if (input.customer_id !== undefined && input.action !== "cancel")
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Solo puedes cancelar tu pedido desde este canal.",
    );
  const initial = await readOrderFinance(container, input.order_id, input);
  return withFinanceExecutionLock(
    container,
    { groupId: initial.group.id, cartId: initial.group.cart_id },
    (ownerId) => operateLockedOrderFinance(container, input, ownerId),
  );
}

async function operateLockedOrderFinance(
  container: MedusaContainer,
  input: OperateOrderFinanceInput,
  ownerId: string,
) {
  const body = orderFinanceInputSchema.parse({
    action: input.action,
    amount: input.amount,
    note: input.note,
    request_id: input.request_id,
    confirm: input.confirm,
  });
  if (input.automatic_capture_revision !== undefined) {
    if (
      body.action !== "capture" ||
      input.seller_id !== undefined ||
      input.customer_id !== undefined
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Operación automática no válida.",
      );
    await assertAutomaticCaptureSettings(
      container,
      input.automatic_capture_revision,
      input.actor_id,
    );
  }
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        ...body,
        order_id: input.order_id,
        actor_id: input.actor_id,
        seller_id: input.seller_id,
        customer_id: input.customer_id,
      }),
    )
    .digest("hex");
  const first = await readOrderFinance(container, input.order_id, input);
  const operationId = `${body.action}:${input.order_id}:${body.request_id}`;
  const previous = first.operations.find(
    (operation) => operation.id === operationId,
  );
  if (previous) {
    const value = financeOperationSchema.parse(previous.result);
    if (value.fingerprint !== fingerprint)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La solicitud ya se utilizó con otros datos.",
      );
    if (previous.state !== "complete")
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Esta operación requiere conciliación; no vuelvas a enviarla.",
      );
    return first.view;
  }
  const claim = await first.journal.claimFinanceGroup({
    groupId: first.group.id,
    cartId: first.group.cart_id,
    ownerId,
  });
  if (!claim?.active_token)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Hay otra operación en curso para esta compra. Actualiza el pedido.",
    );
  const token = claim.active_token;
  let reserved = false;
  let complete = false;
  let operationResult: FinanceOperation | undefined;
  try {
    const current = await readOrderFinance(
      container,
      input.order_id,
      input,
      token,
    );
    const permission =
      body.action === "capture"
        ? current.view.finance.capture
        : body.action === "cancel"
          ? current.view.finance.cancellation
          : current.view.finance.refund;
    if (!permission.allowed)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        permission.reason ?? "Operación no disponible.",
      );
    const amount =
      body.action === "capture"
        ? current.view.finance.capture.amount
        : body.action === "cancel"
          ? current.view.finance.cancellation.refund_amount
          : financeAmount(body.amount!);
    if (
      body.action === "refund" &&
      (!MathBN.gt(amount, 0) ||
        MathBN.gt(amount, current.view.finance.refundable_total))
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El importe supera el saldo reembolsable de esta tienda.",
      );
    }
    const order = current.group.orders.find(
      (order) => order.id === input.order_id,
    )!;
    const collection = order.cart.payment_collection;
    const payment = collection.payments[0];
    const captured = payment.captures.reduce(
      (sum, item) => MathBN.add(sum, item.amount).toNumber(),
      0,
    );
    const refunded = payment.refunds.reduce(
      (sum, item) => MathBN.add(sum, item.amount).toNumber(),
      0,
    );
    const providerBefore = await readFinanceProvider(payment.data.id);
    assertProviderBalances(
      providerBefore,
      captured,
      refunded,
      current.finalCapture?.released_refund_ids,
    );
    if (
      body.action === "capture" &&
      (input.seller_id !== undefined ||
        providerBefore.intent.status !== "requires_capture" ||
        captured !== 0 ||
        refunded !== 0 ||
        !MathBN.eq(
          providerBefore.intent.amount,
          MathBN.mult(payment.amount, 100),
        ) ||
        !MathBN.eq(
          providerBefore.intent.amount_capturable,
          providerBefore.intent.amount,
        ) ||
        current.group.orders.some((item) =>
          item.transactions.some(
            (transaction) => transaction.reference === "capture",
          ),
        ))
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La autorización no permite esta captura final.",
      );
    }
    if (
      captured === 0 &&
      !["requires_capture", "canceled"].includes(providerBefore.intent.status)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El estado de la autorización requiere revisión.",
      );
    }
    await current.journal.observeGroup(
      claim.id,
      token,
      { finance_allocation: current.allocation },
      false,
    );
    operationResult = {
      actor_id: input.actor_id,
      ...(input.customer_id === undefined
        ? {}
        : { customer_id: input.customer_id }),
      execution_owner_id: ownerId,
      execution_host: hostname(),
      execution_pid: process.pid,
      order_id: input.order_id,
      request_id: body.request_id,
      action: body.action,
      amount,
      note: body.note,
      fingerprint,
      refund_ids: [],
      refund_attempted: false,
      reversal_attempted: false,
      capture_attempted: false,
      cancel_authorization_attempted: false,
      ...(amount > 0 && body.action !== "capture"
        ? {
            credit_amount: Math.max(
              0,
              MathBN.sub(
                amount,
                Math.max(0, -(order.summary?.pending_difference ?? 0)),
              ).toNumber(),
            ),
          }
        : {}),
      ...(body.action === "capture"
        ? {
            capture_orders: current.allocation.orders.map((part) => ({
              order_id: part.order_id,
              amount:
                current.group.orders.find((item) => item.id === part.order_id)
                  ?.status === "canceled"
                  ? 0
                  : financeAmount(part.amount),
            })),
          }
        : {}),
    };
    if (amount > 0 && body.action !== "capture") {
      operationResult.settlement = await prepareSettlement({
        payout: current.payout,
        orderId: order.id,
        sellerId: order.seller.id,
        gross: current.view.finance.captured_total,
        sellerNet: current.original!.seller_entitlement,
        refunded: current.view.finance.refunded_total,
        amount,
        paymentIntentId: payment.data.id,
        chargeId:
          typeof providerBefore.intent.latest_charge === "string"
            ? providerBefore.intent.latest_charge
            : providerBefore.intent.latest_charge?.id,
        groupOrderIds: current.group.orders.map((part) => part.id),
        prior: current.operations
          .filter((operation) => operation.state === "complete")
          .flatMap((operation) => {
            const parsed = financeOperationSchema.safeParse(operation.result);
            return parsed.success &&
              parsed.data.order_id === order.id &&
              parsed.data.settlement
              ? [parsed.data.settlement]
              : [];
          }),
      });
    }
    if (input.automatic_capture_revision !== undefined) {
      await assertAutomaticCaptureSettings(
        container,
        input.automatic_capture_revision,
        input.actor_id,
      );
    }
    const operation = await current.journal.claimOperation({
      groupId: claim.id,
      token,
      kind: body.action,
      targetId: `${input.order_id}:${body.request_id}`,
      result: operationResult,
    });
    if (!operation)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Esta operación ya está registrada; actualiza el pedido.",
      );
    reserved = true;
    if (body.action === "capture") {
      operationResult.capture_attempted = true;
      await current.journal.updateCommerceOperations({
        selector: { id: operation.id, token, state: "processing" },
        data: { result: operationResult },
      });
      await performFinalOrderCapture(container, {
        current,
        token,
        operationId: operation.id,
        actorId: input.actor_id,
        persistEvidence: async (evidence) => {
          operationResult!.capture_evidence = evidence;
          await current.journal.updateCommerceOperations({
            selector: { id: operation.id, token, state: "processing" },
            data: { result: operationResult },
          });
        },
      });
    }
    if (amount > 0 && body.action !== "capture") {
      if (operationResult.settlement) {
        operationResult.reversal_attempted =
          financeAmount(
            operationResult.settlement.seller_reversal_amount ??
              operationResult.settlement.seller_reversed,
          ) > 0;
        await current.journal.updateCommerceOperations({
          selector: { id: operation.id, token, state: "processing" },
          data: { result: operationResult },
        });
        operationResult.settlement = await reverseSettlement(
          operationResult.settlement,
          operation.id,
          order.id,
        );
        await current.journal.updateCommerceOperations({
          selector: { id: operation.id, token, state: "processing" },
          data: { result: operationResult },
        });
      }
      if (
        order.transactions.filter(
          (transaction) => transaction.reference === "capture",
        ).length === 0
      ) {
        await recordAllocatedRefundWorkflow(container).run({
          input: {
            order_id: order.id,
            amount: current.view.finance.captured_total,
            currency_code: order.currency_code,
            reference: "capture",
            reference_id: payment.captures[0].id,
          },
        });
      }
      operationResult.refund_attempted = true;
      await current.journal.updateCommerceOperations({
        selector: { id: operation.id, token, state: "processing" },
        data: { result: operationResult },
      });
      const { result: updatedPayment } = await refundAllocatedPaymentWorkflow(
        container,
      ).run({
        input: {
          payment_id: current.refundPaymentId ?? payment.id,
          amount,
          created_by: input.actor_id,
          note: body.note,
          metadata: {
            order_id: input.order_id,
            finance_operation_id: operation.id,
          },
        },
      });
      const created = (updatedPayment.refunds ?? []).filter(
        (refund) =>
          !payment.refunds.some((previous) => previous.id === refund.id),
      );
      const attribution = z
        .object({
          metadata: z.object({ finance_operation_id: z.literal(operation.id) }),
        })
        .safeParse(created[0]);
      if (
        created.length !== 1 ||
        !MathBN.eq(created[0].amount, amount) ||
        !attribution.success
      ) {
        throw new Error("The native refund result is ambiguous.");
      }
      operationResult.refund_ids = [created[0].id];
      await current.journal.updateCommerceOperations({
        selector: { id: operation.id, token, state: "processing" },
        data: { result: operationResult },
      });
      const providerAfter = await readFinanceProvider(payment.data.id);
      assertProviderBalances(
        providerAfter,
        captured,
        MathBN.add(refunded, amount).toNumber(),
        current.finalCapture?.released_refund_ids,
      );
      const newProviderRefunds = providerAfter.refunds.filter(
        (refund) =>
          refund.metadata?.finance_operation_id === operation.id &&
          refund.metadata?.order_id === order.id,
      );
      if (
        newProviderRefunds.length !== 1 ||
        !MathBN.eq(newProviderRefunds[0].amount, MathBN.mult(amount, 100))
      ) {
        throw new Error("The provider refund result is ambiguous.");
      }
      operationResult.provider_refund_id = newProviderRefunds[0].id;
      await current.journal.updateCommerceOperations({
        selector: { id: operation.id, token, state: "processing" },
        data: { result: operationResult },
      });
      await recordAllocatedRefundWorkflow(container).run({
        input: {
          order_id: order.id,
          amount: -amount,
          currency_code: order.currency_code,
          reference_id: created[0].id,
          reference: "refund",
        },
      });
      const credit = financeAmount(operationResult.credit_amount!);
      if (credit > 0) {
        await createOrderCreditLinesWorkflow(container).run({
          input: {
            id: order.id,
            credit_lines: [
              {
                amount: credit,
                reference: "refund",
                reference_id: created[0].id,
              },
            ],
          },
        });
      }
    }
    if (body.action === "cancel") {
      await cancelOrderWorkflow(container).run({
        input: { order_id: order.id, canceled_by: input.actor_id },
      });
      const allCanceled = current.group.orders.every(
        (item) => item.id === order.id || item.status === "canceled",
      );
      if (allCanceled && captured === 0) {
        operationResult.cancel_authorization_attempted = true;
        await current.journal.updateCommerceOperations({
          selector: { id: operation.id, token, state: "processing" },
          data: { result: operationResult },
        });
        await cancelSharedAuthorizationWorkflow(container).run({
          input: { payment_id: payment.id },
        });
        const providerAfter = await readFinanceProvider(payment.data.id);
        if (providerAfter.intent.status !== "canceled")
          throw new Error("The shared authorization was not canceled.");
        assertProviderBalances(providerAfter, 0, 0);
        await closeSharedCollectionWorkflow(container).run({
          input: { collection_id: collection.id },
        });
      }
    }
    await current.journal.finishOperation(
      operation.id,
      token,
      "complete",
      operationResult,
    );
    complete = true;
    await recordOrderFinanceProviderFacts(container, {
      order_id: input.order_id,
      actor_id: input.actor_id,
      owned_token: token,
    });
    await current.journal.releaseGroup(claim.id, token);
    return (await readOrderFinance(container, input.order_id, input)).view;
  } catch (error) {
    if (complete) throw error;
    if (!reserved) {
      await first.journal.releaseGroup(claim.id, token);
      throw error;
    }
    // Never compensate or retry money after an ambiguous provider/network result.
    // The durable fence survives the request and forces reconciliation.
    await first.journal.finishOperation(operationId, token, "uncertain", {
      ...operationResult,
    });
    await first.journal.observeGroup(
      claim.id,
      token,
      {
        finance_review: { operation_id: operationId, order_id: input.order_id },
      },
      true,
    );
    await recordOrderFinanceProviderFacts(container, {
      order_id: input.order_id,
      actor_id: input.actor_id,
      owned_token: token,
    }).catch(() => undefined);
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La operación requiere conciliación del operador. No se realizará un segundo reembolso automáticamente.",
    );
  }
}

export const operateOrderFinanceStep = createStep(
  "operate-order-finance",
  async (input: OperateOrderFinanceInput, { container }) => {
    return new StepResponse(await operateOrderFinance(container, input));
  },
);
