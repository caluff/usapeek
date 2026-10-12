import type { AuthContext } from "@medusajs/framework/http";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { fillAuthenticatedGooglePanelProfileStep } from "./steps/complete-google-auth";

export const fillGooglePanelProfileWorkflow = createWorkflow("fill-google-panel-profile", function (context: AuthContext) {
  return new WorkflowResponse(fillAuthenticatedGooglePanelProfileStep(context));
});
