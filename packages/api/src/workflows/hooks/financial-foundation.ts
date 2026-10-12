import type { MedusaContainer } from "@medusajs/framework/types";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  completeCartWithSplitOrdersWorkflow,
  createPayoutWorkflow,
} from "@mercurjs/core/workflows";
import { freezeOriginalSaleWorkflow } from "../freeze-original-sale";
import {
  discardOriginalSale,
  type OriginalSaleCompensation,
} from "../steps/freeze-original-sale";
import { assertOriginalPayoutEntitlement } from "../../lib/order-finance/payout-entitlement";

// Mercur 2.3.3 declares this hook in the native workflow and exposes it at runtime,
// but omits it from WorkflowResponse's type tuple. Keep the compatibility test.
type BirthHook = (
  invoke: (
    input: { input: { cart_id: string } },
    context: { container: MedusaContainer },
  ) => Promise<
    StepResponse<OriginalSaleCompensation, OriginalSaleCompensation>
  >,
  compensate: (
    receipt: OriginalSaleCompensation | undefined,
    context: { container: MedusaContainer },
  ) => Promise<void>,
) => void;
const hooks =
  completeCartWithSplitOrdersWorkflow.hooks as typeof completeCartWithSplitOrdersWorkflow.hooks & {
    beforePaymentAuthorization: BirthHook;
  };
hooks.beforePaymentAuthorization(
  async ({ input }, { container }) => {
    const { result } = await freezeOriginalSaleWorkflow(container).run({
      input,
    });
    return new StepResponse(result, result);
  },
  async (receipt, { container }) => discardOriginalSale(container, receipt),
);

createPayoutWorkflow.hooks.validatePayout(async (input, { container }) => {
  await assertOriginalPayoutEntitlement(container, input);
});
