import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { reconcileVendorReportingProjections } from "../lib/order-finance/vendor-reporting-projection";

const reconcileVendorFinanceReportingStep = createStep(
  "reconcile-vendor-finance-reporting",
  async (input: { lock_owner_id?: string }, { container }) =>
    new StepResponse(
      await reconcileVendorReportingProjections(container, input),
    ),
);

export const reconcileVendorFinanceReportingWorkflow = createWorkflow(
  "reconcile-vendor-finance-reporting",
  function (input: { lock_owner_id?: string }) {
    return new WorkflowResponse(reconcileVendorFinanceReportingStep(input));
  },
);
