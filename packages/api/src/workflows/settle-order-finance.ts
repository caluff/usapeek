import { createHash } from "node:crypto";
import { hostname } from "node:os";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { PayoutStatus } from "@mercurjs/types";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { readFinanceExecutionWriters } from "../modules/commerce-automation/service";
import {
  assertAutomaticSettlementEligible,
  automaticSettlementEnabled,
  orderCompletionSchema,
  type OrderCompletion,
} from "../lib/order-finance/automatic-settlement";
import {
  AUTOMATIC_SETTLEMENT_ACTOR,
  AUTOMATIC_SETTLEMENT_AUTHORITY,
} from "../lib/order-finance/settlement-authorization";
import { withFinanceExecutionLock } from "../lib/order-finance/execution-lock";
import { withPaymentSettingsLock } from "../lib/order-finance/payment-settings-lock";
import {
  DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
  paymentReleaseDelayDaysSchema,
} from "../lib/order-finance/contracts";
import { financeStripeClient } from "../lib/order-finance/provider";
import { readOrderFinance } from "../lib/order-finance/read";
import { recordOrderFinanceProviderFacts } from "../lib/order-finance/record-provider-facts";
import {
  prepareOrderSettlement,
  requireFinanceOperator,
  settlementPlanSchema,
} from "../lib/order-finance/settlement-plan";
import {
  createSettlementPayoutWorkflow,
  linkSettlementPayoutWorkflow,
} from "./settlement-native";

export const settleOrderInputSchema = z.object({
  order_id: z.string().startsWith("order_"),
  actor_id: z.string().min(1),
  note: z.string().trim().min(3).max(500),
  request_id: z.uuid(),
});
export type SettleOrderInput = z.infer<typeof settleOrderInputSchema>;
export const payoutOperationSchema = z.object({
  action: z.literal("payout"),
  order_id: z.string(),
  actor_id: z.string(),
  note: z.string(),
  request_id: z.uuid(),
  fingerprint: z.string(),
  execution_owner_id: z.string(),
  execution_host: z.string(),
  execution_pid: z.number().int().positive(),
  transfer_attempted: z.boolean(),
  plan: settlementPlanSchema,
  payout_id: z.string().optional(),
  transfer_id: z.string().optional(),
  transfer_created: z.number().int().optional(),
  linked: z.boolean().default(false),
  automatic: z
    .object({
      registration_token: z.uuid(),
      completed_at: z.iso.datetime({ offset: true }),
      eligible_at: z.iso.datetime({ offset: true }),
      release_delay_days: paymentReleaseDelayDaysSchema.default(
        DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
      ),
      observed_order_updated_at: z.iso.datetime({ offset: true }),
    })
    .optional(),
});
export type PayoutOperation = z.infer<typeof payoutOperationSchema>;

export async function settleOrderFinance(
  container: MedusaContainer,
  rawInput: SettleOrderInput,
) {
  const input = settleOrderInputSchema.parse(rawInput);
  await requireFinanceOperator(container, input.actor_id);
  return executeOrderSettlement(container, input);
}

export async function automaticallySettleOrderFinance(
  container: MedusaContainer,
  orderId: string,
) {
  return withPaymentSettingsLock(container, async () => {
    if (!(await automaticSettlementEnabled(container)))
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La liquidación automática no está habilitada.",
      );
    const journal = container.resolve<CommerceAutomationService>(
      COMMERCE_AUTOMATION_MODULE,
    );
    const completion = orderCompletionSchema.parse(
      await journal.readOrderCompletion(orderId),
    );
    if (completion.id !== orderId)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El registro de finalización no corresponde al pedido.",
      );
    return executeOrderSettlement(
      container,
      {
        order_id: completion.id,
        actor_id: AUTOMATIC_SETTLEMENT_ACTOR,
        note:
          completion.release_delay_days === 0
            ? "Liquidación automática sin espera desde la finalización del pedido."
            : `Liquidación automática tras ${completion.release_delay_days * 24} horas desde la finalización del pedido.`,
        request_id: completion.registration_token,
      },
      completion,
    );
  });
}

async function executeOrderSettlement(
  container: MedusaContainer,
  input: SettleOrderInput,
  automatic?: OrderCompletion,
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const initial = await readOrderFinance(container, input.order_id, {
    actor_id: input.actor_id,
  });
  if (
    automatic &&
    (initial.state?.active_token ||
      initial.state?.review_required ||
      readFinanceExecutionWriters(initial.state?.observation).length)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La compra requiere conciliación; no repitas la transferencia.",
    );
  return withFinanceExecutionLock(
    container,
    { groupId: initial.group.id, cartId: initial.group.cart_id },
    async (ownerId) => {
      const first = await readOrderFinance(container, input.order_id, {
        actor_id: input.actor_id,
      });
      if (automatic) {
        const fresh = orderCompletionSchema.parse(
          await first.journal.readOrderCompletion(input.order_id),
        );
        if (
          fresh.id !== automatic.id ||
          fresh.group_id !== automatic.group_id ||
          fresh.cart_id !== automatic.cart_id ||
          fresh.seller_id !== automatic.seller_id ||
          fresh.registration_token !== automatic.registration_token ||
          fresh.completed_at.getTime() !== automatic.completed_at.getTime() ||
          fresh.eligible_at.getTime() !== automatic.eligible_at.getTime() ||
          fresh.release_delay_days !== automatic.release_delay_days ||
          fresh.observed_order_updated_at.getTime() !==
            automatic.observed_order_updated_at.getTime()
        )
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "El registro de finalización requiere conciliación.",
          );
        await assertAutomaticSettlementEligible(
          container,
          first,
          fresh,
          Date.now(),
        );
      }
      const operationId = `payout:${input.order_id}`;
      const previous = first.operations.find(
        (operation) => operation.id === operationId,
      );
      if (previous) {
        const result = payoutOperationSchema.parse(previous.result);
        if (result.fingerprint !== fingerprint && !automatic)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "La tienda ya tiene un plan de liquidación registrado.",
          );
        if (previous.state !== "complete")
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "La liquidación requiere conciliación; no repitas la transferencia.",
          );
        if (
          automatic &&
          (result.plan.order_id !== automatic.id ||
            result.plan.group_id !== automatic.group_id ||
            result.plan.cart_id !== automatic.cart_id ||
            result.plan.seller_id !== automatic.seller_id)
        )
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "La liquidación previa requiere conciliación.",
          );
        return result;
      }
      const claim = await first.journal.claimFinanceGroup({
        groupId: first.group.id,
        cartId: first.group.cart_id,
        ownerId,
      });
      if (!claim?.active_token)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "La compra tiene otra operación en curso.",
        );
      const token = claim.active_token;
      let reserved = false;
      let completed = false;
      let result: PayoutOperation | undefined;
      try {
        const { plan } = await prepareOrderSettlement(
          container,
          input,
          token,
          automatic ? AUTOMATIC_SETTLEMENT_AUTHORITY : undefined,
        );
        if (automatic && !(await automaticSettlementEnabled(container)))
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "La liquidación automática no está habilitada.",
          );
        result = {
          action: "payout",
          ...input,
          fingerprint,
          execution_owner_id: ownerId,
          execution_host: hostname(),
          execution_pid: process.pid,
          transfer_attempted: false,
          plan,
          linked: false,
          ...(automatic
            ? {
                automatic: {
                  registration_token: automatic.registration_token,
                  completed_at: automatic.completed_at.toISOString(),
                  eligible_at: automatic.eligible_at.toISOString(),
                  release_delay_days: automatic.release_delay_days,
                  observed_order_updated_at:
                    automatic.observed_order_updated_at.toISOString(),
                },
              }
            : {}),
        };
        const operation = await first.journal.claimOperation({
          groupId: first.group.id,
          token,
          kind: "payout",
          targetId: input.order_id,
          result,
        });
        if (!operation)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "The settlement is already reserved.",
          );
        reserved = true;
        if (plan.outcome === "transfer_required") {
          if (!plan.account_id || !plan.destination)
            throw new MedusaError(
              MedusaError.Types.NOT_ALLOWED,
              "A transfer requires a frozen destination.",
            );
          result.transfer_attempted = true;
          await first.journal.updateCommerceOperations({
            selector: { id: operationId, token, state: "processing" },
            data: { result },
          });
          const { result: payout } = await createSettlementPayoutWorkflow(
            container,
          ).run({
            input: {
              account_id: plan.account_id,
              amount: plan.amount,
              currency_code: "usd",
              data: {
                id: plan.destination,
                order_id: plan.order_id,
                seller_id: plan.seller_id,
                source_transaction: plan.source_transaction,
                transfer_group: plan.transfer_group,
                metadata: {
                  finance_operation_id: operationId,
                  order_id: plan.order_id,
                  group_id: plan.group_id,
                  seller_id: plan.seller_id,
                },
              },
              context: {
                idempotency_key: `order-finance:${operationId}:transfer`,
              },
            },
          });
          const transferId = z
            .string()
            .startsWith("tr_")
            .parse(payout.data?.id);
          result = { ...result, payout_id: payout.id, transfer_id: transferId };
          await first.journal.updateCommerceOperations({
            selector: { id: operationId, token, state: "processing" },
            data: { result },
          });
          const transfer =
            await financeStripeClient().transfers.retrieve(transferId);
          if (
            transfer.livemode ||
            transfer.currency !== plan.currency_code ||
            transfer.destination !== plan.destination ||
            transfer.source_transaction !== plan.source_transaction ||
            transfer.transfer_group !== plan.transfer_group ||
            transfer.metadata.finance_operation_id !== operationId ||
            transfer.metadata.order_id !== plan.order_id ||
            transfer.metadata.group_id !== plan.group_id ||
            transfer.metadata.seller_id !== plan.seller_id ||
            !MathBN.eq(transfer.amount, MathBN.mult(plan.amount, 100)) ||
            transfer.amount_reversed !== 0 ||
            !MathBN.eq(payout.amount, plan.amount) ||
            payout.account_id !== plan.account_id ||
            payout.currency_code !== plan.currency_code ||
            payout.status !== PayoutStatus.PAID
          )
            throw new MedusaError(
              MedusaError.Types.NOT_ALLOWED,
              "The transfer does not match the frozen settlement plan.",
            );
          result = {
            ...result,
            payout_id: payout.id,
            transfer_id: transfer.id,
            transfer_created: transfer.created,
          };
          await first.journal.updateCommerceOperations({
            selector: { id: operationId, token, state: "processing" },
            data: { result },
          });
          await linkSettlementPayoutWorkflow(container).run({
            input: { payout_id: payout.id, seller_id: plan.seller_id },
          });
          result.linked = true;
        }
        await first.journal.finishOperation(
          operationId,
          token,
          "complete",
          result,
        );
        completed = true;
        await recordOrderFinanceProviderFacts(container, {
          order_id: input.order_id,
          actor_id: input.actor_id,
          owned_token: token,
        });
        await first.journal.releaseGroup(claim.id, token);
        return result;
      } catch (error) {
        if (!reserved) await first.journal.releaseGroup(claim.id, token);
        else if (!completed) {
          await first.journal.finishOperation(operationId, token, "uncertain", {
            ...result,
          });
          await first.journal.observeGroup(
            claim.id,
            token,
            {
              finance_review: {
                operation_id: operationId,
                order_id: input.order_id,
              },
            },
            true,
          );
          await recordOrderFinanceProviderFacts(container, {
            order_id: input.order_id,
            actor_id: input.actor_id,
            owned_token: token,
          });
        }
        throw error;
      }
    },
  );
}

const settleOrderFinanceStep = createStep(
  "settle-order-finance",
  async (input: SettleOrderInput, { container }) =>
    new StepResponse(await settleOrderFinance(container, input)),
);
export const settleOrderFinanceWorkflow = createWorkflow(
  "settle-order-finance",
  function (input: SettleOrderInput) {
    return new WorkflowResponse(settleOrderFinanceStep(input));
  },
);
