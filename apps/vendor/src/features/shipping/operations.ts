import type { PriceDTO, ShippingOptionDTO } from "@medusajs/types";
import type {
  VendorShippingConfiguration,
  VendorShippingConfigurationResponse,
} from "@usapeek/api/shipping-contracts";
import { normalizeUsState } from "@usapeek/ui/us-states";
import type { HttpTypes } from "@mercurjs/types";
import { scopedClient, type AuthorizeVendor } from "../workspace/operations";
import { resourceId, textField } from "../workspace/validation";
import { usdAmount } from "../offers/operations";
import { shippingCoverage } from "./coverage";

export type ShippingOptionWithPrices = ShippingOptionDTO & {
  prices?: Pick<
    PriceDTO,
    | "id"
    | "amount"
    | "currency_code"
    | "min_quantity"
    | "max_quantity"
    | "price_rules"
  >[];
};

export function shippingOptionState(option: ShippingOptionWithPrices) {
  const prices =
    option.prices?.filter((price) => price.currency_code === "usd") ?? [];
  const amount = prices.length === 1 ? Number(prices[0].amount) : NaN;
  const savedStates = option.metadata?.marketplace_v2_states;
  const states = Array.isArray(savedStates)
    ? savedStates.map((value) =>
        typeof value === "string" ? normalizeUsState(value) : "",
      )
    : null;
  return {
    pickup: option.metadata?.marketplace_v2_pickup === true,
    states,
    editable:
      option.metadata?.marketplace_v2_shipping === true &&
      option.metadata?.marketplace_v2_pickup !== true &&
      (states === null || (states.length > 0 && states.every(Boolean))) &&
      option.price_type === "flat" &&
      option.prices?.length === 1 &&
      prices[0]?.min_quantity == null &&
      prices[0]?.max_quantity == null &&
      Array.isArray(prices[0]?.price_rules) &&
      prices[0].price_rules.length === 0 &&
      Number.isFinite(amount) &&
      amount >= 0 &&
      amount <= 1_000_000,
    amount: Number.isFinite(amount) ? String(amount) : "",
    enabled:
      option.rules?.some(
        (rule) =>
          rule.attribute === "enabled_in_store" &&
          rule.operator === "eq" &&
          String(
            typeof rule.value === "object" &&
              rule.value !== null &&
              "value" in rule.value
              ? rule.value.value
              : rule.value,
          ) === "true",
      ) ?? false,
  };
}

export async function shippingConfiguration(
  client: ReturnType<typeof scopedClient>,
) {
  async function loadOptions() {
    const options: ShippingOptionWithPrices[] = [];
    let count = 0;
    do {
      const page = await client.get<
        Omit<HttpTypes.VendorShippingOptionListResponse, "shipping_options"> & {
          shipping_options: ShippingOptionWithPrices[];
        }
      >("/vendor/shipping-options", {
        limit: 100,
        offset: options.length,
        fields:
          "id,name,shipping_profile_id,price_type,metadata,type.description,rules.attribute,rules.operator,rules.value,prices.id,prices.amount,prices.currency_code,prices.min_quantity,prices.max_quantity,prices.price_rules.attribute,prices.price_rules.value",
      });
      count = page.count;
      if (!page.shipping_options.length && options.length < count)
        throw new Error(
          "No se pudieron cargar todas las tarifas. Inténtalo de nuevo.",
        );
      options.push(...page.shipping_options);
    } while (options.length < count);
    return options;
  }
  const [profiles, options, locations, configuration] = await Promise.all([
    client.get<HttpTypes.VendorShippingProfileListResponse>(
      "/vendor/shipping-profiles",
      { limit: 100, fields: "id,name,metadata" },
    ),
    loadOptions(),
    client.get<HttpTypes.VendorStockLocationListResponse>(
      "/vendor/stock-locations",
      { limit: 2, fields: "id,name,address.*" },
    ),
    client.get<VendorShippingConfigurationResponse>(
      "/vendor/shipping-configuration",
    ),
  ]);
  if (profiles.count > profiles.shipping_profiles.length)
    throw new Error(
      "Hay más configuraciones de las que se pueden mostrar. Contacta con soporte para revisar tus envíos.",
    );
  return {
    profiles: profiles.shipping_profiles,
    options,
    locations,
    pickupEnabled: configuration.pickup_enabled,
  };
}

export function shippingOperations(authorize: AuthorizeVendor) {
  return {
    async save(form: FormData) {
      const client = scopedClient(await authorize());
      const action = textField(form, "action", true);
      if (action === "set_profile_archived") {
        const archived = textField(form, "archived", true);
        if (archived !== "true" && archived !== "false")
          throw new Error("Selecciona un estado válido para el perfil.");
        return client.post<{ success: boolean }>(
          "/vendor/shipping-configuration",
          {
            action,
            profile_id: resourceId(textField(form, "profile_id", true)),
            archived: archived === "true",
          } satisfies VendorShippingConfiguration,
        );
      }
      if (action === "set_pickup") {
        const enabled = textField(form, "enabled", true);
        if (enabled !== "true" && enabled !== "false")
          throw new Error("Selecciona una opción válida para la recogida.");
        return client.post<{ success: boolean }>(
          "/vendor/shipping-configuration",
          {
            action,
            enabled: enabled === "true",
          } satisfies VendorShippingConfiguration,
        );
      }
      const name = textField(form, "name", true, 100);
      if (action === "create_profile" || action === "update_profile") {
        return client.post<{ success: boolean }>(
          "/vendor/shipping-configuration",
          {
            name,
            ...(action === "update_profile"
              ? {
                  action,
                  profile_id: resourceId(textField(form, "profile_id", true)),
                }
              : { action }),
          } satisfies VendorShippingConfiguration,
        );
      }
      if (action !== "create_option" && action !== "update_option")
        throw new Error("La operación de envío no es válida.");
      const description = textField(form, "description", true, 500);
      const amount = usdAmount(textField(form, "amount", true));
      if (amount > 1_000_000)
        throw new Error("La tarifa no puede superar 1.000.000 USD.");
      const enabled = textField(form, "enabled");
      if (
        action === "update_option" &&
        enabled !== "true" &&
        enabled !== "false"
      )
        throw new Error("Selecciona un estado válido para la tarifa.");
      return client.post<{ success: boolean }>(
        "/vendor/shipping-configuration",
        {
          name,
          description,
          amount,
          coverage: shippingCoverage(form),
          ...(action === "create_option"
            ? {
                action,
                shipping_profile_id: resourceId(
                  textField(form, "shipping_profile_id", true),
                ),
              }
            : {
                action,
                option_id: resourceId(textField(form, "option_id", true)),
                enabled: enabled === "true",
              }),
        } satisfies VendorShippingConfiguration,
      );
    },
  };
}
