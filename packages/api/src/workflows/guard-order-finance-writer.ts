import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";

type WriterFenceInput = {
  group_id: string;
  cart_id: string;
  action: "claim" | "finish" | "disconnect";
  token?: string;
};

const guardOrderFinanceWriterStep = createStep(
  "guard-order-finance-writer",
  async (input: WriterFenceInput, { container }) => {
    const journal = container.resolve<CommerceAutomationService>(
      COMMERCE_AUTOMATION_MODULE,
    );
    if (input.action === "claim") {
      const claim = await journal.claimGroup(input.group_id, input.cart_id);
      if (!claim?.active_token)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "La compra tiene otra operación en curso.",
        );
      if (claim.review_required) {
        await journal.releaseGroup(claim.id, claim.active_token);
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "La compra requiere conciliación del operador.",
        );
      }
      return new StepResponse(claim.active_token);
    }
    if (!input.token) throw new Error("Writer fence ownership is required.");
    if (input.action === "finish") {
      await journal.releaseGroup(input.group_id, input.token);
    } else {
      // An aborted HTTP response does not cancel the native workflow. Keep its
      // durable fence, including across process restarts, until reconciliation.
      await journal.observeGroup(
        input.group_id,
        input.token,
        { finance_writer_disconnected: true },
        true,
      );
    }
    return new StepResponse(input.token);
  },
);

export const guardOrderFinanceWriterWorkflow = createWorkflow(
  "guard-order-finance-writer",
  (input: WriterFenceInput) =>
    new WorkflowResponse(guardOrderFinanceWriterStep(input)),
);
