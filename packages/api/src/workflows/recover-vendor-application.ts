import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import { emitEventStep } from "@medusajs/core-flows";
import { transform } from "@medusajs/framework/workflows-sdk";
import { APPLICATION_NOTIFICATION_EVENT } from "../lib/admin-notifications/events";
import { onboardingService } from "../lib/vendor-onboarding/access";
import { OnboardingError } from "../lib/vendor-onboarding/errors";
import { finalizeVendorApprovalStep } from "./steps/provision-vendor-application";
import { reconcileVendorApplication } from "./steps/reconcile-vendor-application";

const validateRecoveryStep = createStep("validate-recovery", async (operationId: string, { container }) => {
  const service = onboardingService(container);
  const operation = await service.retrieveVendorApplicationMutation(operationId);
  const application = await service.retrieveVendorApplication(operation.application_id);
  const execution = await container.resolve(Modules.WORKFLOW_ENGINE).retrieveWorkflowExecution({ workflow_id: "mutate-vendor-application", transaction_id: operation.transaction_id });
  if (operation.state !== "processing" || application.approval_operation_id !== operationId || execution.state !== "done") throw new OnboardingError("approval_in_progress");
  return new StepResponse({ operation_id: operation.id, application_id: application.id });
});
export const finalizeVendorApplicationRecoveryWorkflow = createWorkflow("finalize-vendor-application-recovery", function (input: { operation_id: string }) {
  const operation = validateRecoveryStep(input.operation_id);
  const finalized = finalizeVendorApprovalStep(operation);
  emitEventStep({
    eventName: APPLICATION_NOTIFICATION_EVENT,
    data: transform({ operation, finalized }, ({ operation }) => ({ id: operation.application_id })),
  });
  return new WorkflowResponse(finalized);
});

const reconcileCanceledApplicationStep = createStep("reconcile-canceled-application", async (operationId: string, { container }) => {
  const service = onboardingService(container);
  const operation = await service.retrieveVendorApplicationMutation(operationId);
  const execution = await container.resolve(Modules.WORKFLOW_ENGINE).retrieveWorkflowExecution({ workflow_id: "mutate-vendor-application", transaction_id: operation.transaction_id });
  if (!["reverted", "failed"].includes(execution.state)) throw new OnboardingError("approval_in_progress");
  if (operation.state === "failed") return new StepResponse({ reconciled: true });
  await reconcileVendorApplication(container, operationId);
  await service.fenceApproval(operationId, { failed: true });
  return new StepResponse({ reconciled: true });
});
export const reconcileCanceledVendorApplicationWorkflow = createWorkflow("reconcile-canceled-vendor-application", function (input: { operation_id: string }) {
  return new WorkflowResponse(reconcileCanceledApplicationStep(input.operation_id));
});
