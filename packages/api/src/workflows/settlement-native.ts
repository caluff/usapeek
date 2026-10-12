import { createRemoteLinkStep } from "@medusajs/core-flows";
import { createPayoutStep } from "@mercurjs/core/workflows";
import { MercurModules } from "@mercurjs/types";
import type { CreatePayoutDTO } from "@mercurjs/types";
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

// A missing link must not compensate or repeat an already executed transfer.
export const createSettlementPayoutWorkflow = createWorkflow(
  "create-settlement-payout",
  function (input: CreatePayoutDTO) {
    return new WorkflowResponse(createPayoutStep(input));
  },
);

export const linkSettlementPayoutWorkflow = createWorkflow(
  "link-settlement-payout",
  function (input: { payout_id: string; seller_id: string }) {
    return new WorkflowResponse(
      createRemoteLinkStep([
        {
          [MercurModules.PAYOUT]: { payout_id: input.payout_id },
          [MercurModules.SELLER]: { seller_id: input.seller_id },
        },
      ]),
    );
  },
);
