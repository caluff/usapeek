import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createOrderFulfillmentWorkflow } from "@mercurjs/core/workflows";
import {
  prepareVendorOrderFulfillment,
  type VendorOrderPreparationInput,
} from "../lib/vendor-orders/preparation";

const prepareVendorOrderFulfillmentStep = createStep(
  "prepare-vendor-order-fulfillment",
  async (input: VendorOrderPreparationInput, { container }) =>
    new StepResponse(await prepareVendorOrderFulfillment(container, input)),
);

export const createVendorOrderFulfillmentWorkflow = createWorkflow(
  "create-vendor-order-fulfillment",
  function (input: VendorOrderPreparationInput) {
    const prepared = prepareVendorOrderFulfillmentStep(input);
    const fulfillment = createOrderFulfillmentWorkflow.runAsStep({
      input: prepared,
    });
    return new WorkflowResponse(fulfillment);
  },
);
