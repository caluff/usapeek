import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";

const invalidateVendorSettlementsStep = createStep(
  "invalidate-vendor-settlements",
  async (input: { order_ids: string[] }, { container }) => {
    await container
      .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
      .invalidateVendorSettlements(input.order_ids);
    return new StepResponse(undefined);
  },
);

export const invalidateVendorSettlementsWorkflow = createWorkflow(
  "invalidate-vendor-settlements",
  function (input: { order_ids: string[] }) {
    return new WorkflowResponse(invalidateVendorSettlementsStep(input));
  },
);
