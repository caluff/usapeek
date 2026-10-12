import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { updateVendorStock, type UpdateVendorStockInput } from "../../lib/inventory/update-vendor-stock";

export const updateVendorStockStep = createStep("update-vendor-stock", async (input: UpdateVendorStockInput, { container }) => {
  // This is the sole mutation step. Never compensate an absolute stock count over
  // a newer reservation/fulfillment; the module transaction rolls back failures.
  return new StepResponse(await updateVendorStock(container, input));
});
