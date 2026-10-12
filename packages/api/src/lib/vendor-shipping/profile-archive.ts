import type {
  IFulfillmentModuleService,
  MedusaContainer,
  ShippingOptionDTO,
  ShippingProfileDTO,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  RuleOperator,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  assertShippingOwnership,
  SHIPPING_PROFILE_ARCHIVED_KEY,
} from "./configuration";

const STORE_RULE_SNAPSHOT_KEY = "marketplace_v2_store_rules_before_archive";
const shippingRule = z.object({
  id: z.string().optional(),
  attribute: z.string(),
  operator: z.enum(RuleOperator),
  value: z.union([z.string(), z.array(z.string())]),
});
const storeRuleSnapshot = z.array(
  shippingRule.extend({
    attribute: z.literal("enabled_in_store"),
  }),
);

function optionRules(option: ShippingOptionDTO) {
  return option.rules.map(({ id, attribute, operator, value }) =>
    shippingRule.parse({
      id,
      attribute,
      operator,
      value:
        value && typeof value === "object" && "value" in value
          ? value.value
          : value,
    }),
  );
}

export async function prepareShippingProfileArchivePlan(
  container: MedusaContainer,
  sellerId: string,
  profile: ShippingProfileDTO,
  archived: boolean,
) {
  await assertShippingOwnership(
    container,
    sellerId,
    "shipping_profile",
    profile.id,
  );
  const changed =
    (profile.metadata?.[SHIPPING_PROFILE_ARCHIVED_KEY] === true) !== archived;
  const profileUpdate = {
    selector: { id: profile.id },
    update: {
      name: profile.name,
      metadata: {
        ...profile.metadata,
        [SHIPPING_PROFILE_ARCHIVED_KEY]: archived,
      },
    },
  };
  if (!changed && !archived)
    return {
      changed,
      profileUpdate,
      optionUpdates: [],
      ruleChanges: { create: [], update: [], delete: [] },
    };
  const service = container.resolve<IFulfillmentModuleService>(
    Modules.FULFILLMENT,
  );
  const options = await service.listShippingOptions(
    { shipping_profile_id: profile.id },
    { relations: ["rules"] },
  );
  await Promise.all(
    options.map((option) =>
      assertShippingOwnership(
        container,
        sellerId,
        "shipping_option",
        option.id,
      ),
    ),
  );
  const { data: sellers } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      { entity: "seller", fields: ["metadata"], filters: { id: sellerId } },
      { cache: { enable: false } },
    );
  const pickupEnabled =
    sellers[0]?.metadata?.marketplace_v2_pickup_enabled === true;
  const optionUpdates = options.map((option) => {
    const rules = optionRules(option);
    const storeRules = rules.filter(
      (rule) => rule.attribute === "enabled_in_store",
    );
    const otherRules = rules.filter(
      (rule) => rule.attribute !== "enabled_in_store",
    );
    if (archived) {
      const savedSnapshot = storeRuleSnapshot.safeParse(
        option.metadata?.[STORE_RULE_SNAPSHOT_KEY],
      );
      return {
        id: option.id,
        metadata: {
          ...option.metadata,
          [STORE_RULE_SNAPSHOT_KEY]:
            !changed && savedSnapshot.success ? savedSnapshot.data : storeRules,
        },
        rules: [
          ...otherRules,
          {
            ...(storeRules[0] ? { id: storeRules[0].id } : {}),
            attribute: "enabled_in_store",
            operator: RuleOperator.EQ,
            value: "false",
          },
        ],
      };
    }
    const snapshot = storeRuleSnapshot.safeParse(
      option.metadata?.[STORE_RULE_SNAPSHOT_KEY],
    );
    if (!snapshot.success)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No se puede restaurar la configuración original de las tarifas de este perfil.",
      );
    return {
      id: option.id,
      metadata: { ...option.metadata, [STORE_RULE_SNAPSHOT_KEY]: null },
      rules: [
        ...otherRules,
        ...(option.metadata?.marketplace_v2_pickup === true
          ? [
              {
                ...(storeRules[0] ? { id: storeRules[0].id } : {}),
                attribute: "enabled_in_store",
                operator: RuleOperator.EQ,
                value: String(pickupEnabled),
              },
            ]
          : snapshot.data.map(({ id, ...rule }) => ({
              ...rule,
              ...(rules.some((existing) => existing.id === id) ? { id } : {}),
            }))),
      ],
    };
  });
  const ruleChanges = {
    create: optionUpdates.flatMap((option) =>
      option.rules
        .filter((rule) => !("id" in rule) || !rule.id)
        .map((rule) => ({
          attribute: rule.attribute,
          operator: rule.operator,
          value: rule.value,
          shipping_option_id: option.id,
        })),
    ),
    update: optionUpdates.flatMap((option) =>
      option.rules
        .filter((rule) => "id" in rule && !!rule.id)
        .map((rule) => ({
          ...rule,
          id: (rule as { id: string }).id,
        })),
    ),
    delete: options.flatMap((option) =>
      option.rules
        .filter(
          (rule) =>
            !optionUpdates
              .find((update) => update.id === option.id)!
              .rules.some(
                (desired) => "id" in desired && desired.id === rule.id,
              ),
        )
        .map((rule) => rule.id),
    ),
  };
  return { changed, profileUpdate, optionUpdates, ruleChanges };
}
