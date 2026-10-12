import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { capturePreparedPurchase } from "../lib/order-finance/automatic-capture";

const capturePreparedPurchaseStep = createStep(
  "capture-prepared-purchase",
  async (input: { order_id: string }, { container }) =>
    new StepResponse(await capturePreparedPurchase(container, input.order_id)),
);

export const capturePreparedPurchaseWorkflow = createWorkflow(
  "capture-prepared-purchase",
  function (input: { order_id: string }) {
    return new WorkflowResponse(capturePreparedPurchaseStep(input));
  },
);
