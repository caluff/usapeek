import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { onboardingService } from "../lib/vendor-onboarding/access";
import { finalizeVendorApplicationRecoveryWorkflow, reconcileCanceledVendorApplicationWorkflow } from "../workflows/recover-vendor-application";

export default async function recoverVendorApplication({ container, args }: ExecArgs) {
  const [operationId, action = "inspect"] = args;
  if (!operationId || !["inspect", "cancel", "finalize"].includes(action)) throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, "Usage: medusa exec ./src/scripts/recover-vendor-application.ts <operation-id> [inspect|cancel|finalize]");
  const operation = await onboardingService(container).retrieveVendorApplicationMutation(operationId);
  const engine = container.resolve(Modules.WORKFLOW_ENGINE);
  const execution = await engine.retrieveWorkflowExecution({ workflow_id: "mutate-vendor-application", transaction_id: operation.transaction_id });
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  logger.info(JSON.stringify({ operation_id: operation.id, application_id: operation.application_id, operation_state: operation.state, workflow_state: execution.state, transaction_id: operation.transaction_id, member_id: operation.member_id, seller_id: operation.seller_id }));
  if (action === "inspect") return;
  if (process.env.VENDOR_ONBOARDING_RECOVERY_CONFIRMED !== "true") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Inspect the original operation and stop its executing worker before setting VENDOR_ONBOARDING_RECOVERY_CONFIRMED=true for recovery.");
  if (action === "finalize") {
    const { result } = await finalizeVendorApplicationRecoveryWorkflow(container).run({ input: { operation_id: operation.id } });
    logger.info(result.completed ? "Application approval finalized." : "Database outcome remains uncertain; retain the same operation for recovery.");
    return;
  }
  if (operation.state !== "processing" || execution.state === "done" || Date.now() - new Date(execution.updated_at).getTime() < 300_000) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only a stale unfinished original operation may be canceled; a completed native saga must be finalized.");
  await engine.cancel("mutate-vendor-application", { transactionId: operation.transaction_id, container, throwOnError: true });
  await reconcileCanceledVendorApplicationWorkflow(container).run({ input: { operation_id: operation.id } });
  logger.info("Original workflow cancellation requested; inspect again and retry compensation through the native workflow engine if it remains incomplete.");
}
