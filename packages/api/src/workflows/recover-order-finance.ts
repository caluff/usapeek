import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { cancelOrderWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { PayoutStatus } from "@mercurjs/types";
import {
  financeExecutionWriterSchema,
  withFinanceExecutionLock,
} from "../lib/order-finance/execution-lock";
import {
  financeAmount,
  financeGroupSchema,
  type FinanceOperation,
} from "../lib/order-finance/policy";
import {
  recoveryInputSchema,
  inspectFinanceRecovery,
  requireRecovery,
  hasRecoveryCredit,
  hasRecoveryTransaction,
} from "../lib/order-finance/recovery-plan";
import { readOrderFinance } from "../lib/order-finance/read";
import { readFinanceProvider } from "../lib/order-finance/provider";
import { recordOrderFinanceProviderFacts } from "../lib/order-finance/record-provider-facts";
import { executeAuthorizationRecovery } from "../lib/order-finance/recovery-authorization";
import { recordReconciledPayoutWorkflow } from "./recovery-native";
import { linkSettlementPayoutWorkflow } from "./settlement-native";
import {
  createOrderCreditLinesWorkflow,
  recordAllocatedRefundWorkflow,
  refundAllocatedPaymentWorkflow,
} from "./order-finance-native";

export const executeRecoveryInputSchema = recoveryInputSchema.extend({
  plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
  release_stopped_writer: z.boolean().default(false),
});
export type ExecuteRecoveryInput = z.infer<typeof executeRecoveryInputSchema>;

export async function recoverOrderFinance(
  container: MedusaContainer,
  rawInput: ExecuteRecoveryInput,
) {
  const input = executeRecoveryInputSchema.parse(rawInput);
  const initial = await inspectFinanceRecovery(container, input);
  requireRecovery(
    initial.plan_hash === input.plan_hash,
    "La inspección cambió. Revisa el plan actualizado antes de ejecutarlo.",
  );
  const attempts = await initial.current.journal.listFinanceRecoveryAttempts(
    { operation_id: initial.operation.id, token: initial.operation.token },
    { take: 2 },
  );
  requireRecovery(
    attempts.length <= 1,
    "El último intento de recuperación no es inequívoco.",
  );
  const previousWriter = attempts[0]?.observation ?? initial.operation.result;
  const writer = financeExecutionWriterSchema.safeParse({
    execution_owner_id: previousWriter?.execution_owner_id,
    execution_host: previousWriter?.execution_host,
    execution_pid: previousWriter?.execution_pid,
  });
  return withFinanceExecutionLock(
    container,
    {
      groupId: initial.current.group.id,
      cartId: initial.current.group.cart_id,
    },
    async (ownerId) => {
      const inspected = await inspectFinanceRecovery(container, input);
      requireRecovery(
        inspected.plan_hash === input.plan_hash,
        "El plan cambió antes de adquirir la exclusión.",
      );
      const { current, operation, prepared } = inspected;
      const claim = await current.journal.claimRecovery({
        operationId: operation.id,
        expectedToken: operation.token,
        expectedState: operation.state,
        actorId: input.actor_id,
        reason: input.reason,
        plan: inspected.plan,
        observation: {
          ...inspected.plan.observation,
          execution_owner_id: ownerId,
          execution_host: hostname(),
          execution_pid: process.pid,
          ...(input.release_stopped_writer && writer.success
            ? { prior_writer: writer.data }
            : {}),
        },
      });
      let result: Record<string, unknown> = { ...operation.result };
      const checkpoint = async () => {
        await current.journal.checkpointRecovery({
          operationId: operation.id,
          token: claim.token,
          attemptId: claim.attempt.id,
          result,
        });
      };
      try {
        if (operation.state === "complete") {
          // Verified fence cleanup must preserve the completed journal byte-for-byte.
        } else if (prepared.kind === "payout") {
          const value = { ...prepared.result };
          const { plan } = value;
          result = value;
          if (plan.outcome === "transfer_required") {
            const transfer = prepared.transfer!;
            requireRecovery(plan.account_id, "Falta la cuenta congelada.");
            let payout = prepared.payout;
            if (!payout) {
              const id = `payout_reconciled_${createHash("sha256").update(`stripe:${plan.mode}:${plan.platform_account_id}:${transfer.id}`).digest("hex").slice(0, 32)}`;
              const { result: adopted } = await recordReconciledPayoutWorkflow(
                container,
              ).run({
                input: {
                  id,
                  account_id: plan.account_id,
                  amount: plan.amount,
                  currency_code: "usd",
                  status: PayoutStatus.PAID,
                  data: { ...transfer },
                },
              });
              payout = adopted;
            }
            Object.assign(value, {
              transfer_id: transfer.id,
              transfer_created: transfer.created,
              payout_id: payout.id,
            });
            await checkpoint();
            if (prepared.actions.includes("link_payout")) {
              await linkSettlementPayoutWorkflow(container).run({
                input: { payout_id: payout.id, seller_id: plan.seller_id },
              });
            }
            value.linked = true;
          }
        } else if (prepared.kind === "authorization") {
          result = await executeAuthorizationRecovery(container, {
            current,
            operation,
            prepared,
            actor_id: input.actor_id,
            token: claim.token,
            checkpoint: async (value) => {
              result = value;
              await checkpoint();
            },
          });
        } else if (prepared.kind === "cancellation") {
          if (prepared.actions.includes("cancel_order")) {
            await cancelOrderWorkflow(container).run({
              input: {
                order_id: prepared.result.order_id,
                canceled_by: input.actor_id,
              },
            });
          }
        } else {
          const value: FinanceOperation = structuredClone(prepared.result);
          result = value;
          const order = current.group.orders.find(
            (item) => item.id === input.order_id,
          )!;
          const payment = order.cart.payment_collection.payments[0];
          const amount = financeAmount(value.amount);
          if (prepared.reversal)
            value.settlement = {
              ...value.settlement!,
              reversal_id: prepared.reversal.id,
              seller_reversed: financeAmount(
                value.settlement!.seller_reversal_amount!,
              ),
            };
          if (prepared.refund) value.provider_refund_id = prepared.refund.id;
          await checkpoint();
          if (prepared.actions.includes("record_capture_transaction")) {
            const ownAmount =
              current.finalCapture?.orders.find(
                (part) => part.order_id === order.id,
              )?.amount ?? current.original!.gross;
            await recordAllocatedRefundWorkflow(container).run({
              input: {
                order_id: order.id,
                amount: financeAmount(ownAmount),
                currency_code: "usd",
                reference: "capture",
                reference_id: payment.captures[0].id,
              },
            });
          }
          let localRefund = prepared.localRefund;
          if (!localRefund) {
            value.refund_attempted = true;
            await checkpoint();
            const { result: updated } = await refundAllocatedPaymentWorkflow(
              container,
            ).run({
              input: {
                payment_id: current.refundPaymentId ?? payment.id,
                amount,
                created_by: input.actor_id,
                note: value.note,
                metadata: {
                  order_id: order.id,
                  finance_operation_id: operation.id,
                  ...(prepared.refund
                    ? {
                        finance_recovery_mode: "adopt_only",
                        stripe_refund_id: prepared.refund.id,
                      }
                    : {}),
                },
              },
            });
            const nativeRefunds =
              financeGroupSchema.shape.orders.element.shape.cart.shape.payment_collection.shape.payments.element.shape.refunds.parse(
                updated.refunds,
              );
            const matches = nativeRefunds.filter(
              (item) => item.metadata?.finance_operation_id === operation.id,
            );
            requireRecovery(
              matches.length === 1 &&
                MathBN.eq(matches[0].amount, amount) &&
                matches[0].metadata?.order_id === order.id,
              "El reembolso nativo no confirmó su identidad.",
            );
            localRefund = {
              ...matches[0],
              amount,
              metadata: matches[0].metadata ?? null,
            };
          }
          value.refund_ids = [localRefund.id];
          const provider = await readFinanceProvider(payment.data.id);
          const refunds = provider.refunds.filter(
            (part) =>
              part.metadata?.finance_operation_id === operation.id &&
              part.metadata?.order_id === order.id,
          );
          requireRecovery(
            refunds.length === 1 &&
              refunds[0].amount === MathBN.mult(amount, 100).toNumber() &&
              (!value.provider_refund_id ||
                value.provider_refund_id === refunds[0].id),
            "Stripe no confirmó el reembolso de la operación.",
          );
          value.provider_refund_id = refunds[0].id;
          await checkpoint();
          const fresh = await readOrderFinance(
            container,
            order.id,
            { actor_id: input.actor_id },
            claim.token,
          );
          const updatedOrder = fresh.group.orders.find(
            (item) => item.id === order.id,
          )!;
          if (
            !hasRecoveryTransaction(
              updatedOrder,
              "refund",
              localRefund.id,
              -amount,
            )
          ) {
            await recordAllocatedRefundWorkflow(container).run({
              input: {
                order_id: order.id,
                amount: -amount,
                currency_code: "usd",
                reference: "refund",
                reference_id: localRefund.id,
              },
            });
          }
          const credit = financeAmount(value.credit_amount!);
          if (
            !hasRecoveryCredit(updatedOrder, localRefund.id, credit) &&
            credit > 0
          ) {
            await createOrderCreditLinesWorkflow(container).run({
              input: {
                id: order.id,
                credit_lines: [
                  {
                    amount: credit,
                    reference: "refund",
                    reference_id: localRefund.id,
                  },
                ],
              },
            });
          }
          if (prepared.actions.includes("cancel_order"))
            await cancelOrderWorkflow(container).run({
              input: { order_id: order.id, canceled_by: input.actor_id },
            });
        }
        if (operation.state !== "complete") await checkpoint();
        const verified = await inspectFinanceRecovery(container, input);
        requireRecovery(
          verified.prepared.actions.length === 0,
          "Quedan pasos sin verificar; el bloqueo permanece activo.",
        );
        await recordOrderFinanceProviderFacts(container, {
          order_id: input.order_id,
          actor_id: input.actor_id,
          owned_token: claim.token,
        });
        const completed = await current.journal.finishRecovery({
          operationId: operation.id,
          token: claim.token,
          attemptId: claim.attempt.id,
          state: "complete",
          result,
          observation: verified.plan.observation,
        });
        // The final CAS changes the operation revision. Observe that committed
        // revision while still holding the writer lock; stale coverage stays
        // explicit if this optional reporting refresh cannot finish.
        let providerObservationPending = false;
        try {
          await recordOrderFinanceProviderFacts(container, {
            order_id: input.order_id,
            actor_id: input.actor_id,
            owned_token: completed.fenceReleased ? undefined : claim.token,
          });
        } catch {
          providerObservationPending = true;
        }
        return {
          operation_id: operation.id,
          state: completed.operation.state,
          fence_released: completed.fenceReleased,
          attempt_id: completed.attempt.id,
          provider_observation_pending: providerObservationPending,
        };
      } catch (error) {
        await recordOrderFinanceProviderFacts(container, {
          order_id: input.order_id,
          actor_id: input.actor_id,
          owned_token: claim.token,
        }).catch(() => undefined);
        await current.journal.finishRecovery({
          operationId: operation.id,
          token: claim.token,
          attemptId: claim.attempt.id,
          state: "uncertain",
          result,
          observation: { verification: "incomplete" },
        });
        throw error;
      }
    },
    {
      releaseStoppedWriter: input.release_stopped_writer,
      priorWriter: writer.success ? writer.data : undefined,
    },
  );
}

const recoverOrderFinanceStep = createStep(
  "recover-order-finance",
  async (input: ExecuteRecoveryInput, { container }) =>
    new StepResponse(await recoverOrderFinance(container, input)),
);
export const recoverOrderFinanceWorkflow = createWorkflow(
  "recover-order-finance",
  function (input: ExecuteRecoveryInput) {
    return new WorkflowResponse(recoverOrderFinanceStep(input));
  },
);
