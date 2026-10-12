import type { AuthContext } from "@medusajs/framework/http";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { ConsumeVendorSessionInput } from "../api/auth/vendor-session/validators";
import { issueVendorSessionStep, consumeVendorSessionStep } from "./steps/vendor-session";

export const issueVendorSessionWorkflow = createWorkflow("issue-vendor-session", function (input: AuthContext) {
  return new WorkflowResponse(issueVendorSessionStep(input));
});
export const consumeVendorSessionWorkflow = createWorkflow("consume-vendor-session", function (input: ConsumeVendorSessionInput) {
  return new WorkflowResponse(consumeVendorSessionStep(input));
});
