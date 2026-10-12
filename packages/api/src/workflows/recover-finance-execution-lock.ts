import { createHash, randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import {
  isStoppedFinanceWriter,
  withFinanceExecutionLock,
} from "../lib/order-finance/execution-lock";
import { readOrderFinance } from "../lib/order-finance/read";
import { requireRecovery } from "../lib/order-finance/recovery-plan";
import { requireFinanceOperator } from "../lib/order-finance/settlement-plan";
import { readFinanceExecutionWriters } from "../modules/commerce-automation/service";

export const recoverExecutionLockInputSchema = z.object({
  order_id: z.string().startsWith("order_"),
  owner_id: z.uuid(),
  actor_id: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});
type InspectInput = z.infer<typeof recoverExecutionLockInputSchema>;

export async function inspectFinanceExecutionLock(
  container: MedusaContainer,
  rawInput: InspectInput,
) {
  const input = recoverExecutionLockInputSchema.parse(rawInput);
  await requireFinanceOperator(container, input.actor_id);
  const current = await readOrderFinance(container, input.order_id, {
    actor_id: input.actor_id,
  });
  const writers = readFinanceExecutionWriters(current.state?.observation);
  const matching = writers.filter(
    (writer) => writer.execution_owner_id === input.owner_id,
  );
  requireRecovery(
    matching.length === 1,
    "No hay una identidad durable e inequívoca para ese bloqueo.",
  );
  const writer = matching[0];
  const plan = {
    version: 1,
    action: "release_stopped_execution_lock",
    order_id: input.order_id,
    group_id: current.group.id,
    cart_id: current.group.cart_id,
    actor_id: input.actor_id,
    reason: input.reason,
    writer,
    has_financial_fence: Boolean(current.state?.active_token),
    review_retained: Boolean(current.state?.review_required),
  };
  const planHash = createHash("sha256")
    .update(
      JSON.stringify({
        plan,
        active_token: current.state?.active_token ?? null,
      }),
    )
    .digest("hex");
  return { current, writer, plan, plan_hash: planHash };
}

const executeInputSchema = recoverExecutionLockInputSchema.extend({
  plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
  release_stopped_writer: z.literal(true),
});
type ExecuteInput = z.infer<typeof executeInputSchema>;

export async function recoverFinanceExecutionLock(
  container: MedusaContainer,
  rawInput: ExecuteInput,
) {
  const input = executeInputSchema.parse(rawInput);
  const inspected = await inspectFinanceExecutionLock(container, input);
  requireRecovery(
    inspected.plan_hash === input.plan_hash,
    "El bloqueo cambió; revisa la inspección actualizada.",
  );
  const { current, writer, plan } = inspected;
  const attempt = await current.journal.createFinanceRecoveryAttempts({
    id: randomUUID(),
    operation_id: `execution-lock:${writer.execution_owner_id}`,
    group_id: current.group.id,
    actor_id: input.actor_id,
    reason: input.reason,
    prior_token: writer.execution_owner_id,
    token: randomUUID(),
    prior_state: "processing",
    state: "processing",
    original_result: null,
    original_group: current.state ?? {},
    plan,
    observation: { plan_hash: input.plan_hash },
  });
  try {
    const result = await withFinanceExecutionLock(
      container,
      {
        groupId: current.group.id,
        cartId: current.group.cart_id,
      },
      async () => {
        const locked = await inspectFinanceExecutionLock(container, input);
        requireRecovery(
          locked.plan_hash === input.plan_hash,
          "El bloqueo cambió antes de adquirir la exclusión.",
        );
        requireRecovery(
          isStoppedFinanceWriter(locked.writer),
          "No se confirmó un proceso local detenido para el bloqueo.",
        );
        const resolved =
          await locked.current.journal.resolveFinanceExecutionFence({
            groupId: current.group.id,
            cartId: current.group.cart_id,
            ownerId: writer.execution_owner_id,
            actorId: input.actor_id,
            reason: input.reason,
          });
        await locked.current.journal.removeFinanceExecutionWriter({
          groupId: current.group.id,
          cartId: current.group.cart_id,
          ownerId: writer.execution_owner_id,
        });
        return {
          ...plan,
          released: true,
          fence_released: resolved.fenceReleased,
        };
      },
      {
        releaseStoppedWriter: true,
        priorWriter: writer,
        stoppedOwnerId: input.owner_id,
      },
    );
    await current.journal.updateFinanceRecoveryAttempts({
      id: attempt.id,
      state: "complete",
      final_result: result,
      final_observation: result,
      finished_at: new Date(),
    });
    return result;
  } catch (error) {
    await current.journal.updateFinanceRecoveryAttempts({
      id: attempt.id,
      state: "uncertain",
      final_observation: {
        error:
          error instanceof Error
            ? error.message
            : "Execution lock recovery failed.",
      },
      finished_at: new Date(),
    });
    throw error;
  }
}

const recoverFinanceExecutionLockStep = createStep(
  "recover-finance-execution-lock",
  async (input: ExecuteInput, { container }) =>
    new StepResponse(await recoverFinanceExecutionLock(container, input)),
);
export const recoverFinanceExecutionLockWorkflow = createWorkflow(
  "recover-finance-execution-lock",
  (input: ExecuteInput) =>
    new WorkflowResponse(recoverFinanceExecutionLockStep(input)),
);
