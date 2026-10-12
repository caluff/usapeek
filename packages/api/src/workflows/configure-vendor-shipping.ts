import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  releaseLockStep,
  updateShippingProfilesWorkflow,
  updateShippingOptionsWorkflow,
  updateShippingOptionTypesWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  createSellerShippingProfilesWorkflow,
  createSellerShippingOptionsWorkflow,
} from "@mercurjs/core/workflows";
import { RuleOperator } from "@medusajs/framework/utils";
import { randomUUID } from "node:crypto";
import { zoneCoverage } from "../lib/vendor-shipping/coverage";
import { syncVendorPickupWorkflow } from "./sync-vendor-pickup";
import { prepareVendorShippingWorkflow } from "./prepare-vendor-shipping";
import { setShippingProfileArchivedWorkflow } from "./set-shipping-profile-archived";
import {
  shippingProfileName,
  validateShippingConfiguration,
  SHIPPING_PROVIDER_ID,
  type ShippingInput,
} from "../lib/vendor-shipping/configuration";

const validateVendorShippingConfigurationStep = createStep(
  "validate-vendor-shipping-configuration",
  async (input: ShippingInput, { container }) =>
    new StepResponse(await validateShippingConfiguration(container, input)),
);
export const configureVendorShippingWorkflow = createWorkflow(
  "configure-vendor-shipping",
  function (input: ShippingInput) {
    const lock = transform(input, (value) => ({
      key: `vendor-shipping:${value.seller_id}`,
      ownerId: randomUUID(),
      ttl: 120,
      timeout: 0,
    }));
    acquireLockStep(lock);
    const validated = validateVendorShippingConfigurationStep(input);

    when(
      "create-profile",
      { validated },
      ({ validated }) => validated.configuration.action === "create_profile",
    ).then(() => {
      const data = transform({ validated, input }, ({ validated, input }) => {
        const configuration = validated.configuration as Extract<
          ShippingInput["configuration"],
          { action: "create_profile" }
        >;
        return {
          seller_id: input.seller_id,
          shipping_profiles: [
            {
              name: shippingProfileName(input.seller_id, configuration.name),
              type: "default",
              metadata: {
                marketplace_v2_shipping: true,
                marketplace_v2_display_name: configuration.name,
              },
            },
          ],
        };
      });
      const profiles = createSellerShippingProfilesWorkflow.runAsStep({
        input: data,
      });
      const pickupInput = transform({ input, profiles }, ({ input }) => ({
        seller_id: input.seller_id,
      }));
      syncVendorPickupWorkflow
        .runAsStep({ input: pickupInput })
        .config({ name: "sync-new-profile-pickup" });
    });

    when(
      "update-profile",
      { validated },
      ({ validated }) => validated.configuration.action === "update_profile",
    ).then(() => {
      const data = transform({ validated, input }, ({ validated, input }) => {
        const configuration = validated.configuration as Extract<
          ShippingInput["configuration"],
          { action: "update_profile" }
        >;
        return {
          selector: { id: configuration.profile_id },
          update: {
            name: shippingProfileName(input.seller_id, configuration.name),
            metadata: {
              ...validated.profile!.metadata,
              marketplace_v2_shipping: true,
              marketplace_v2_display_name: configuration.name,
            },
          },
        };
      });
      updateShippingProfilesWorkflow.runAsStep({ input: data });
    });

    when(
      "set-profile-archived",
      { validated },
      ({ validated }) =>
        validated.configuration.action === "set_profile_archived",
    ).then(() => {
      const archiveInput = transform(
        { input, validated },
        ({ input, validated }) => {
          const configuration = validated.configuration as Extract<
            ShippingInput["configuration"],
            { action: "set_profile_archived" }
          >;
          return {
            seller_id: input.seller_id,
            profile: validated.profile!,
            archived: configuration.archived,
          };
        },
      );
      setShippingProfileArchivedWorkflow.runAsStep({ input: archiveInput });
    });

    when(
      "create-option",
      { validated },
      ({ validated }) => validated.configuration.action === "create_option",
    ).then(() => {
      const infrastructureInput = transform(
        { input, validated },
        ({ input, validated }) => ({
          seller_id: input.seller_id,
          type: "shipping" as const,
          coverage: (
            validated.configuration as Extract<
              ShippingInput["configuration"],
              { action: "create_option" }
            >
          ).coverage ?? { mode: "all" as const },
        }),
      );
      const infrastructure = prepareVendorShippingWorkflow.runAsStep({
        input: infrastructureInput,
      });
      const data = transform(
        { validated, input, infrastructure },
        ({ validated, input, infrastructure }) => {
          const configuration = validated.configuration as Extract<
            ShippingInput["configuration"],
            { action: "create_option" }
          >;
          return {
            seller_id: input.seller_id,
            shipping_options: [
              {
                name: configuration.name,
                shipping_profile_id: configuration.shipping_profile_id,
                service_zone_id: infrastructure.service_zone_id,
                price_type: "flat" as const,
                provider_id: SHIPPING_PROVIDER_ID,
                type: {
                  label: configuration.name,
                  description: configuration.description,
                  code: `vendor-${randomUUID()}`,
                },
                prices: [
                  { currency_code: "usd", amount: configuration.amount },
                ],
                rules: [
                  {
                    attribute: "enabled_in_store",
                    operator: RuleOperator.EQ,
                    value: "true",
                  },
                  {
                    attribute: "is_return",
                    operator: RuleOperator.EQ,
                    value: "false",
                  },
                ],
                metadata: {
                  marketplace_v2_shipping: true,
                  marketplace_v2_states:
                    configuration.coverage?.mode === "states"
                      ? configuration.coverage.states
                      : null,
                },
              },
            ],
          };
        },
      );
      createSellerShippingOptionsWorkflow.runAsStep({ input: data });
    });

    when(
      "update-option",
      { validated },
      ({ validated }) => validated.configuration.action === "update_option",
    ).then(() => {
      const infrastructureInput = transform(
        { input, validated },
        ({ input, validated }) => ({
          seller_id: input.seller_id,
          type: "shipping" as const,
          coverage:
            (
              validated.configuration as Extract<
                ShippingInput["configuration"],
                { action: "update_option" }
              >
            ).coverage ??
            zoneCoverage(validated.current!.service_zone.geo_zones)!,
        }),
      );
      const infrastructure = prepareVendorShippingWorkflow
        .runAsStep({ input: infrastructureInput })
        .config({ name: "prepare-updated-option-zone" });
      const typeData = transform(validated, ({ configuration, current }) => {
        const update = configuration as Extract<
          ShippingInput["configuration"],
          { action: "update_option" }
        >;
        return {
          selector: { id: current!.type.id },
          update: { label: update.name, description: update.description },
        };
      });
      updateShippingOptionTypesWorkflow.runAsStep({ input: typeData });
      const data = transform(
        { validated, infrastructure, infrastructureInput },
        ({ validated, infrastructure, infrastructureInput }) => {
          const configuration = validated.configuration as Extract<
            ShippingInput["configuration"],
            { action: "update_option" }
          >;
          const current = validated.current!;
          const price_id = validated.price_id;
          return [
            {
              id: configuration.option_id,
              name: configuration.name,
              service_zone_id: infrastructure.service_zone_id,
              metadata: {
                ...current.metadata,
                marketplace_v2_states:
                  infrastructureInput.coverage.mode === "states"
                    ? infrastructureInput.coverage.states
                    : null,
              },
              price_type: "flat" as const,
              prices: [
                {
                  id: price_id,
                  currency_code: "usd",
                  amount: configuration.amount,
                },
              ],
              rules: [
                {
                  ...current.rules.find(
                    (rule) => rule.attribute === "enabled_in_store",
                  ),
                  attribute: "enabled_in_store",
                  operator: RuleOperator.EQ,
                  value: String(configuration.enabled),
                },
                {
                  ...current.rules.find(
                    (rule) => rule.attribute === "is_return",
                  ),
                  attribute: "is_return",
                  operator: RuleOperator.EQ,
                  value: "false",
                },
              ],
            },
          ];
        },
      );
      updateShippingOptionsWorkflow.runAsStep({ input: data });
    });
    when(
      "set-pickup",
      { validated },
      ({ validated }) => validated.configuration.action === "set_pickup",
    ).then(() => {
      const pickupInput = transform(
        { input, validated },
        ({ input, validated }) => ({
          seller_id: input.seller_id,
          enabled: (
            validated.configuration as Extract<
              ShippingInput["configuration"],
              { action: "set_pickup" }
            >
          ).enabled,
        }),
      );
      syncVendorPickupWorkflow
        .runAsStep({ input: pickupInput })
        .config({ name: "set-store-pickup" });
    });
    releaseLockStep(lock);
    return new WorkflowResponse({ success: true });
  },
);
