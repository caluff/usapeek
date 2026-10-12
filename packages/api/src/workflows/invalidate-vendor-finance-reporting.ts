import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { invalidateVendorReporting } from "../lib/order-finance/vendor-reporting-projection";

const invalidateVendorFinanceReportingStep = createStep(
  "invalidate-vendor-finance-reporting",
  async (input: { order_ids?: string[]; group_id?: string }, { container }) => {
    await invalidateVendorReporting(container, input);
    return new StepResponse(undefined);
  },
);

export const invalidateVendorFinanceReportingWorkflow = createWorkflow(
  "invalidate-vendor-finance-reporting",
  function (input: { order_ids?: string[]; group_id?: string }) {
    return new WorkflowResponse(invalidateVendorFinanceReportingStep(input));
  },
);
