import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  inspectFinanceRecovery,
  recoveryInputSchema,
} from "../lib/order-finance/recovery-plan";
import { recoverOrderFinanceWorkflow } from "../workflows/recover-order-finance";
import {
  inspectFinanceExecutionLock,
  recoverFinanceExecutionLockWorkflow,
} from "../workflows/recover-finance-execution-lock";

export default async function recoverOrderFinance({
  container,
  args,
}: ExecArgs) {
  const [orderId, operationId, actorId, reason, ...options] = args;
  const input = recoveryInputSchema.parse({
    order_id: orderId,
    operation_id: operationId,
    actor_id: actorId,
    reason,
  });
  const execute = options.includes("--execute");
  const hashOption = options.find((part) => part.startsWith("--plan-hash="));
  if (
    options.some(
      (part) =>
        !["--execute", "--release-stopped-writer"].includes(part) &&
        !part.startsWith("--plan-hash="),
    )
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Opciones desconocidas. Usa --execute --plan-hash=<hash de inspección> y, sólo para un proceso local detenido, --release-stopped-writer.",
    );
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (operationId.startsWith("lock:")) {
    const lockInput = {
      order_id: orderId,
      owner_id: operationId.slice("lock:".length),
      actor_id: actorId,
      reason,
    };
    if (!execute) {
      const inspected = await inspectFinanceExecutionLock(container, lockInput);
      logger.info(
        JSON.stringify(
          { ...inspected.plan, plan_hash: inspected.plan_hash },
          null,
          2,
        ),
      );
      return;
    }
    if (!options.includes("--release-stopped-writer"))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "La liberación requiere --release-stopped-writer.",
      );
    const { result } = await recoverFinanceExecutionLockWorkflow(container).run(
      {
        input: {
          ...lockInput,
          plan_hash: hashOption?.slice("--plan-hash=".length) ?? "",
          release_stopped_writer: true,
        },
      },
    );
    logger.info(JSON.stringify(result, null, 2));
    return;
  }
  if (!execute) {
    const inspected = await inspectFinanceRecovery(container, input);
    logger.info(
      JSON.stringify(
        { ...inspected.plan, plan_hash: inspected.plan_hash },
        null,
        2,
      ),
    );
    return;
  }
  const { result } = await recoverOrderFinanceWorkflow(container).run({
    input: {
      ...input,
      plan_hash: hashOption?.slice("--plan-hash=".length) ?? "",
      release_stopped_writer: options.includes("--release-stopped-writer"),
    },
  });
  logger.info(JSON.stringify(result, null, 2));
}
