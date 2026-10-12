import type PayoutModule from "@mercurjs/core/modules/payout";
import type { PayoutDTO } from "@mercurjs/types";
import { MercurModules } from "@mercurjs/types";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

type AdoptPayoutInput = Pick<
  PayoutDTO,
  "id" | "account_id" | "amount" | "currency_code" | "status" | "data"
>;
const recordReconciledPayoutStep = createStep(
  "record-reconciled-payout",
  async (input: AdoptPayoutInput, { container }) => {
    const service = container.resolve<
      InstanceType<typeof PayoutModule.service>
    >(MercurModules.PAYOUT);
    return new StepResponse(await service.recordReconciledPayout(input));
  },
);

// This step only records an already verified effect. It has no provider call or
// monetary compensation; later failures must leave the effect available to resume.
export const recordReconciledPayoutWorkflow = createWorkflow(
  "record-reconciled-payout",
  function (input: AdoptPayoutInput) {
    return new WorkflowResponse(recordReconciledPayoutStep(input));
  },
);
