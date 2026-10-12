import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { freezeOriginalSaleStep } from "./steps/freeze-original-sale";

export const freezeOriginalSaleWorkflow = createWorkflow(
  "freeze-original-sale",
  function (input: { cart_id: string }) {
    const receipt = freezeOriginalSaleStep(input);
    return new WorkflowResponse(receipt);
  },
);
