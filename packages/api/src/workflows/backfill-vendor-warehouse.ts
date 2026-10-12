import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { backfillVendorWarehouseStep, type BackfillWarehouseInput } from "./steps/backfill-vendor-warehouse";

export const backfillVendorWarehouseWorkflow = createWorkflow("backfill-vendor-warehouse", function (input: BackfillWarehouseInput) {
  return new WorkflowResponse(backfillVendorWarehouseStep(input));
});
