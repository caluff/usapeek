import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { completeGoogleAuthStep, type CompleteGoogleAuthWorkflowInput } from "./steps/complete-google-auth";

export const completeGoogleAuthWorkflow = createWorkflow("complete-google-auth", function (input: CompleteGoogleAuthWorkflowInput) {
  return new WorkflowResponse(completeGoogleAuthStep(input));
});
