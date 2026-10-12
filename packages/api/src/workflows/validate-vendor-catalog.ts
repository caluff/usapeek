import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { validateCatalogMutation } from "../lib/catalog/product-validation";

const validateVendorCatalogStep = createStep(
  "validate-vendor-catalog",
  async (
    input: Parameters<typeof validateCatalogMutation>[1],
    { container },
  ) => {
    await validateCatalogMutation(container, input);
    return new StepResponse(undefined);
  },
);
export const validateVendorCatalogWorkflow = createWorkflow(
  "validate-vendor-catalog",
  function (input: Parameters<typeof validateCatalogMutation>[1]) {
    const result = validateVendorCatalogStep(input);
    return new WorkflowResponse(result);
  },
);
