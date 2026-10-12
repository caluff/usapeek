import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import type { StripeAccountVendor } from "../lib/stripe-connect/account-reconciliation";
import {
  reconcileStripeAccountStep,
  resolveVendorStripeAccountStep,
} from "./steps/reconcile-stripe-account";

export const refreshVendorStripeAccountWorkflow = createWorkflow(
  "refresh-vendor-stripe-account",
  function (input: StripeAccountVendor) {
    const payoutAccountId = resolveVendorStripeAccountStep(input);
    const result = reconcileStripeAccountStep({
      payout_account_id: payoutAccountId,
      vendor: input,
    });
    return new WorkflowResponse(result);
  },
);
