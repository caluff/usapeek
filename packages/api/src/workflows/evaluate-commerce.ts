import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { evaluateCommerceStep } from "./steps/evaluate-commerce";

export const evaluateCommerceWorkflow = createWorkflow(
  "evaluate-commerce",
  function (input: Record<string, never>) {
    return new WorkflowResponse(evaluateCommerceStep(input));
  },
);
