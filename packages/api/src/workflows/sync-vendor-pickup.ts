import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  RuleOperator,
} from "@medusajs/framework/utils";
import { batchShippingOptionRulesWorkflow } from "@medusajs/medusa/core-flows";
import {
  createSellerShippingOptionsWorkflow,
  updateSellersWorkflow,
} from "@mercurjs/core/workflows";
import { randomUUID } from "node:crypto";
import { prepareVendorShippingWorkflow } from "./prepare-vendor-shipping";
import {
  SHIPPING_PROVIDER_ID,
  SHIPPING_PROFILE_ARCHIVED_KEY,
} from "../lib/vendor-shipping/configuration";
import { requireSellerWarehouse } from "../lib/vendor-warehouse/access";
import type { MedusaContainer } from "@medusajs/framework/types";

export const PICKUP_ENABLED_KEY = "marketplace_v2_pickup_enabled";
type Input = { seller_id: string; enabled?: boolean };

export async function prepareVendorPickupPlan(
  input: Input,
  container: MedusaContainer,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: sellers } = await query.graph(
    {
      entity: "seller",
      fields: ["id", "metadata"],
      filters: { id: input.seller_id },
    },
    { cache: { enable: false } },
  );
  const seller = sellers[0];
  if (!seller)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No se encontró la tienda.",
    );
  const enabled =
    input.enabled ?? seller.metadata?.[PICKUP_ENABLED_KEY] === true;
  if (enabled) {
    const locationId = await requireSellerWarehouse(container, input.seller_id);
    const { data: locations } = await query.graph(
      {
        entity: "stock_location",
        fields: [
          "id",
          "address.address_1",
          "address.country_code",
          "address.province",
          "address.city",
          "address.postal_code",
        ],
        filters: { id: locationId },
      },
      { cache: { enable: false } },
    );
    const address = locations[0]?.address;
    if (
      !address?.address_1 ||
      address.country_code?.toLowerCase() !== "us" ||
      !address.province ||
      !address.city ||
      !address.postal_code
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Completa la dirección del almacén antes de habilitar la recogida en tienda.",
      );
    }
  }
  const [{ data: profiles }, { data: links }] = await Promise.all([
    query.graph(
      {
        entity: "shipping_profile_seller",
        fields: ["shipping_profile_id", "shipping_profile.metadata"],
        filters: { seller_id: input.seller_id },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "shipping_option_seller",
        fields: [
          "shipping_option.id",
          "shipping_option.shipping_profile_id",
          "shipping_option.metadata",
          "shipping_option.rules.*",
        ],
        filters: { seller_id: input.seller_id },
      },
      { cache: { enable: false } },
    ),
  ]);
  const options = links
    .map((link) => link.shipping_option)
    .filter((option) => option?.metadata?.marketplace_v2_pickup === true);
  const archivedProfileIds = new Set(
    profiles
      .filter(
        (profile) =>
          profile.shipping_profile?.metadata?.[
            SHIPPING_PROFILE_ARCHIVED_KEY
          ] === true,
      )
      .map((profile) => profile.shipping_profile_id),
  );
  return {
    enabled,
    sellerUpdate: {
      selector: { id: seller.id },
      update: {
        metadata: { ...seller.metadata, [PICKUP_ENABLED_KEY]: enabled },
      },
    },
    missingProfiles: enabled
      ? profiles
          .map((profile) => profile.shipping_profile_id)
          .filter(
            (id) =>
              !options.some((option) => option!.shipping_profile_id === id),
          )
          .filter((id) => !archivedProfileIds.has(id))
      : [],
    updates: options.map((option) => ({
      id: option!.id,
      rules: [
        {
          ...option!.rules.find(
            (rule) => rule.attribute === "enabled_in_store",
          ),
          attribute: "enabled_in_store",
          operator: RuleOperator.EQ,
          value: String(
            enabled && !archivedProfileIds.has(option!.shipping_profile_id),
          ),
        },
        {
          ...option!.rules.find((rule) => rule.attribute === "is_return"),
          attribute: "is_return",
          operator: RuleOperator.EQ,
          value: "false",
        },
      ],
    })),
  };
}

const planVendorPickup = createStep(
  "plan-vendor-pickup",
  async (input: Input, { container }) =>
    new StepResponse(await prepareVendorPickupPlan(input, container)),
);

export const syncVendorPickupWorkflow = createWorkflow(
  "sync-vendor-pickup",
  function (input: Input) {
    const plan = planVendorPickup(input);
    when(
      "create-missing-pickup-options",
      { plan },
      ({ plan }) => plan.missingProfiles.length > 0,
    ).then(() => {
      const infrastructure = prepareVendorShippingWorkflow.runAsStep({
        input: {
          seller_id: input.seller_id,
          type: "pickup",
          coverage: { mode: "all" },
        },
      });
      const data = transform(
        { input, plan, infrastructure },
        ({ input, plan, infrastructure }) => ({
          seller_id: input.seller_id,
          shipping_options: plan.missingProfiles.map((shipping_profile_id) => ({
            name: "Recogida en tienda",
            shipping_profile_id,
            service_zone_id: infrastructure.service_zone_id,
            provider_id: SHIPPING_PROVIDER_ID,
            price_type: "flat" as const,
            type: {
              label: "Recogida en tienda",
              description: "Retira tu pedido en la dirección de la tienda.",
              code: `marketplace-pickup-${randomUUID()}`,
            },
            prices: [{ currency_code: "usd", amount: 0 }],
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
              marketplace_v2_pickup: true,
            },
          })),
        }),
      );
      createSellerShippingOptionsWorkflow.runAsStep({ input: data });
    });
    when(
      "update-pickup-options",
      { plan },
      ({ plan }) => plan.updates.length > 0,
    ).then(() => {
      const rules = transform(plan, ({ updates }) => ({
        create: updates.flatMap((option) =>
          option.rules
            .filter((rule) => !rule.id)
            .map(({ attribute, operator, value }) => ({
              attribute,
              operator,
              value,
              shipping_option_id: option.id,
            })),
        ),
        update: updates.flatMap((option) =>
          option.rules
            .filter((rule) => !!rule.id)
            .map(({ id, attribute, operator, value }) => ({
              id: id!,
              attribute,
              operator,
              value,
            })),
        ),
      }));
      batchShippingOptionRulesWorkflow.runAsStep({ input: rules });
    });
    when(
      "save-pickup-setting",
      { input },
      ({ input }) => input.enabled !== undefined,
    ).then(() => {
      updateSellersWorkflow.runAsStep({ input: plan.sellerUpdate });
    });
    return new WorkflowResponse({ pickup_enabled: plan.enabled });
  },
);
