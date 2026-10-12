import { requestVerificationWorkflow } from "@medusajs/core-flows";
import type { AuthContext } from "@medusajs/framework/http";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { confirmAccountEmailVerificationStep, prepareAccountEmailVerificationStep } from "./steps/account-email-verification";

export const requestAccountEmailVerificationWorkflow = createWorkflow("request-account-email-verification", function (context: AuthContext) {
  const input = prepareAccountEmailVerificationStep(context);
  requestVerificationWorkflow.runAsStep({ input });
  return new WorkflowResponse({ status: "requested" as const });
});

export const confirmAccountEmailVerificationWorkflow = createWorkflow("confirm-account-email-verification", function (input: { auth_context: AuthContext; code: string }) {
  return new WorkflowResponse(confirmAccountEmailVerificationStep(input));
});
