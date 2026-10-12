import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { reconcileVendorSettlementProjections } from "../lib/order-finance/vendor-settlement-projection";

const reconcileVendorSettlementsStep = createStep(
  "reconcile-vendor-settlements",
  async (input: { take?: number; lock_owner_id?: string }, { container }) =>
    new StepResponse(
      await reconcileVendorSettlementProjections(container, input),
    ),
);

export const reconcileVendorSettlementsWorkflow = createWorkflow(
  "reconcile-vendor-settlements",
  function (input: { take?: number; lock_owner_id?: string }) {
    return new WorkflowResponse(reconcileVendorSettlementsStep(input));
  },
);
