import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { reconcileStripeAccountStep } from "./steps/reconcile-stripe-account";

// Internal entry point for a verified native account webhook, never an HTTP body.
export const reconcileStripeAccountWorkflow = createWorkflow(
  "reconcile-stripe-account",
  function (input: { payout_account_id: string }) {
    const result = reconcileStripeAccountStep(input);
    return new WorkflowResponse(result);
  },
);
