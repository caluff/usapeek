import type { ShippingProfileDTO } from "@medusajs/framework/types";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  updateShippingOptionsWorkflow,
  updateShippingProfilesWorkflow,
  batchShippingOptionRulesWorkflow,
} from "@medusajs/medusa/core-flows";
import { prepareShippingProfileArchivePlan } from "../lib/vendor-shipping/profile-archive";
import { syncVendorPickupWorkflow } from "./sync-vendor-pickup";

type Input = {
  seller_id: string;
  profile: ShippingProfileDTO;
  archived: boolean;
};

const planShippingProfileArchiveStep = createStep(
  "plan-shipping-profile-archive",
  async (input: Input, { container }) =>
    new StepResponse(
      await prepareShippingProfileArchivePlan(
        container,
        input.seller_id,
        input.profile,
        input.archived,
      ),
    ),
);

export const setShippingProfileArchivedWorkflow = createWorkflow(
  "set-shipping-profile-archived",
  function (input: Input) {
    const plan = planShippingProfileArchiveStep(input);
    const profiles = updateShippingProfilesWorkflow.runAsStep({
      input: plan.profileUpdate,
    });
    const optionUpdates = transform({ plan, profiles }, ({ plan }) =>
      plan.optionUpdates.map(({ id, metadata }) => ({ id, metadata })),
    );
    const options = updateShippingOptionsWorkflow.runAsStep({
      input: optionUpdates,
    });
    const ruleInput = transform(
      { plan, options },
      ({ plan }) => plan.ruleChanges,
    );
    const rules = batchShippingOptionRulesWorkflow.runAsStep({
      input: ruleInput,
    });
    const pickupInput = transform(
      { input, profiles, options, rules },
      ({ input }) => ({ seller_id: input.seller_id }),
    );
    when(
      "sync-restored-profile-pickup",
      { input, plan },
      ({ input, plan }) => plan.changed && !input.archived,
    ).then(() => {
      syncVendorPickupWorkflow.runAsStep({ input: pickupInput });
    });
    return new WorkflowResponse({ success: true });
  },
);
