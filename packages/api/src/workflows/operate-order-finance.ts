import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  operateOrderFinanceStep,
  type OperateOrderFinanceInput,
} from "./steps/operate-order-finance";

export const operateOrderFinanceWorkflow = createWorkflow(
  "operate-order-finance",
  function (input: OperateOrderFinanceInput) {
    return new WorkflowResponse(operateOrderFinanceStep(input));
  },
);
