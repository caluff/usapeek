import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createFulfillmentSets,
  createServiceZonesWorkflow,
  createRemoteLinkStep,
} from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import {
  coverageGeoZones,
  type ShippingCoverage,
} from "../lib/vendor-shipping/coverage";
import { shippingInfrastructurePlan } from "../lib/vendor-shipping/configuration";
const prepareVendorShippingInfrastructureStep = createStep(
  "prepare-vendor-shipping-infrastructure",
  async (
    input: {
      seller_id: string;
      coverage: ShippingCoverage;
      type: "shipping" | "pickup";
    },
    { container },
  ) =>
    new StepResponse(
      await shippingInfrastructurePlan(
        container,
        input.seller_id,
        input.coverage,
        input.type,
      ),
    ),
);

export const prepareVendorShippingWorkflow = createWorkflow(
  "prepare-vendor-shipping",
  function (input: {
    seller_id: string;
    coverage: ShippingCoverage;
    type: "shipping" | "pickup";
  }) {
    const plan = prepareVendorShippingInfrastructureStep(input);
    const newSet = when(
      "create-shipping-set",
      { plan },
      ({ plan }) => !plan.fulfillment_set_id,
    ).then(() => {
      const sets = createFulfillmentSets([
        { name: plan.fulfillment_set_name, type: input.type },
      ]);
      createRemoteLinkStep([
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: plan.location_id },
          [Modules.FULFILLMENT]: { fulfillment_set_id: sets[0].id },
        },
      ]).config({ name: "link-new-shipping-set" });
      return sets[0];
    });
    const setId = transform(
      { plan, newSet },
      ({ plan, newSet }) => plan.fulfillment_set_id ?? newSet!.id,
    );
    const newZones = when(
      "create-us-service-zone",
      { plan },
      ({ plan }) => !plan.service_zone_id,
    ).then(() => {
      const zoneInput = transform(
        { input, plan, setId },
        ({ input, plan, setId }) => ({
          data: [
            {
              name:
                input.coverage.mode === "all"
                  ? plan.fulfillment_set_name
                  : `${plan.fulfillment_set_name} · ${input.coverage.states.join(",")}`,
              fulfillment_set_id: setId,
              geo_zones: coverageGeoZones(input.coverage),
            },
          ],
        }),
      );
      return createServiceZonesWorkflow.runAsStep({ input: zoneInput });
    });
    const zoneId = transform(
      { plan, newZones },
      ({ plan, newZones }) => plan.service_zone_id ?? newZones![0].id,
    );
    createRemoteLinkStep(plan.links);
    return new WorkflowResponse({ service_zone_id: zoneId });
  },
);
