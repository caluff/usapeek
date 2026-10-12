import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { UpdateVendorStockInput } from "../lib/inventory/update-vendor-stock";
import { updateVendorStockStep } from "./steps/update-vendor-stock";

export const updateVendorStockWorkflow = createWorkflow("update-vendor-stock", function (input: UpdateVendorStockInput) {
  return new WorkflowResponse(updateVendorStockStep(input));
});
