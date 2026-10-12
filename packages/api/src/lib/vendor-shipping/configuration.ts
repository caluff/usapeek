import type {
  IFulfillmentModuleService,
  MedusaContainer,
  LinkDefinition,
  PriceDTO,
  ShippingOptionDTO,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { VendorShippingConfiguration } from "../../api/vendor/shipping-configuration/validators";
import { requireSellerWarehouse } from "../vendor-warehouse/access";
import {
  coverageGeoZones,
  zoneCoverage,
  type ShippingCoverage,
} from "./coverage";

export type ShippingInput = {
  seller_id: string;
  configuration: VendorShippingConfiguration;
};
export const SHIPPING_PROVIDER_ID = "manual_manual";
export const SHIPPING_PROFILE_ARCHIVED_KEY = "marketplace_v2_archived";
export const SHIPPING_SET_NAME = "usapeek · Estados Unidos";
export const shippingSetName = (sellerId: string) =>
  `${SHIPPING_SET_NAME} · ${sellerId}`;
export const shippingProfileName = (sellerId: string, name: string) =>
  `${name} · ${sellerId}`;

export async function assertShippingOwnership(
  container: MedusaContainer,
  sellerId: string,
  entity: "shipping_profile" | "shipping_option",
  id: string,
) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: `${entity}_seller`,
        fields: ["seller_id"],
        filters: { seller_id: sellerId, [`${entity}_id`]: id },
      },
      { cache: { enable: false } },
    );
  if (data.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No se encontró la configuración de envío de esta tienda.",
    );
}

export async function validateShippingConfiguration(
  container: MedusaContainer,
  input: ShippingInput,
) {
  const configuration = VendorShippingConfiguration.parse(input.configuration);
  if (!input.seller_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Selecciona una tienda.",
    );
  const service = container.resolve<IFulfillmentModuleService>(
    Modules.FULFILLMENT,
  );
  const profileId =
    configuration.action === "update_profile" ||
    configuration.action === "set_profile_archived"
      ? configuration.profile_id
      : configuration.action === "create_option"
        ? configuration.shipping_profile_id
        : undefined;
  let profile;
  if (profileId) {
    await assertShippingOwnership(
      container,
      input.seller_id,
      "shipping_profile",
      profileId,
    );
    profile = await service.retrieveShippingProfile(profileId);
  }
  if (
    configuration.action === "create_option" &&
    profile?.metadata?.[SHIPPING_PROFILE_ARCHIVED_KEY] === true
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Restaura el perfil de envío antes de añadir o editar tarifas.",
    );
  if (configuration.action === "update_option") {
    await assertShippingOwnership(
      container,
      input.seller_id,
      "shipping_option",
      configuration.option_id,
    );
    const current = await service.retrieveShippingOption(
      configuration.option_id,
      { relations: ["service_zone.geo_zones", "type", "rules"] },
    );
    await assertShippingOwnership(
      container,
      input.seller_id,
      "shipping_profile",
      current.shipping_profile_id,
    );
    profile = await service.retrieveShippingProfile(
      current.shipping_profile_id,
    );
    if (profile.metadata?.[SHIPPING_PROFILE_ARCHIVED_KEY] === true)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Restaura el perfil de envío antes de añadir o editar tarifas.",
      );
    const warehouse = await requireSellerWarehouse(container, input.seller_id);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const [{ data: links }, { data: options }, { data: typedOptions }] =
      await Promise.all([
        query.graph(
          {
            entity: "location_fulfillment_set",
            fields: ["stock_location_id"],
            filters: {
              fulfillment_set_id: current.service_zone.fulfillment_set_id,
            },
          },
          { cache: { enable: false } },
        ),
        query.graph(
          {
            entity: "shipping_option",
            fields: [
              "id",
              "prices.id",
              "prices.currency_code",
              "prices.min_quantity",
              "prices.max_quantity",
              "prices.price_rules.id",
            ],
            filters: { id: current.id },
          },
          { cache: { enable: false } },
        ),
        query.graph(
          {
            entity: "shipping_option",
            fields: ["id"],
            filters: { shipping_option_type_id: current.type.id },
            pagination: { take: 2 },
          },
          { cache: { enable: false } },
        ),
      ]);
    const prices =
      (
        options as unknown as Array<
          Pick<ShippingOptionDTO, "id"> & { prices: PriceDTO[] }
        >
      )[0]?.prices ?? [];
    const simplePrice =
      prices.length === 1 &&
      prices[0]?.currency_code === "usd" &&
      !prices[0]?.min_quantity &&
      !prices[0]?.max_quantity &&
      !prices[0]?.price_rules?.length;
    if (
      current.metadata?.marketplace_v2_shipping !== true ||
      current.metadata?.marketplace_v2_pickup === true ||
      current.price_type !== "flat" ||
      !simplePrice ||
      typedOptions.length !== 1 ||
      typedOptions[0].id !== current.id
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Esta opción utiliza una configuración avanzada que no puede editarse aquí.",
      );
    }
    if (
      links.length !== 1 ||
      links[0].stock_location_id !== warehouse ||
      current.provider_id !== SHIPPING_PROVIDER_ID ||
      !zoneCoverage(current.service_zone.geo_zones)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Esta opción no corresponde a los envíos de Estados Unidos de tu almacén.",
      );
    }
    return { configuration, profile, current, price_id: prices[0]!.id };
  }
  return { configuration, profile, current: undefined, price_id: undefined };
}

export function isUnitedStatesZone(
  zones: { type: string; country_code: string }[],
) {
  return (
    zones.length === 1 &&
    zones[0].type === "country" &&
    zones[0].country_code.toLowerCase() === "us"
  );
}

export async function shippingInfrastructurePlan(
  container: MedusaContainer,
  sellerId: string,
  coverage: ShippingCoverage = { mode: "all" },
  type: "shipping" | "pickup" = "shipping",
) {
  const locationId = await requireSellerWarehouse(container, sellerId);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: locations } = await query.graph(
    {
      entity: "stock_location",
      filters: { id: locationId },
      fields: [
        "id",
        "fulfillment_sets.id",
        "fulfillment_sets.type",
        "fulfillment_sets.name",
        "fulfillment_sets.service_zones.id",
        "fulfillment_sets.service_zones.geo_zones.type",
        "fulfillment_sets.service_zones.geo_zones.country_code",
        "fulfillment_sets.service_zones.geo_zones.province_code",
        "fulfillment_providers.id",
        "sales_channels.id",
      ],
    },
    { cache: { enable: false } },
  );
  const location = locations[0];
  if (!location)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No se encontró tu almacén.",
    );
  const { data: providers } = await query.graph(
    {
      entity: "fulfillment_provider",
      fields: ["id", "is_enabled"],
      filters: { id: SHIPPING_PROVIDER_ID, is_enabled: true },
    },
    { cache: { enable: false } },
  );
  if (providers.length !== 1)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "El servicio de envío manual no está disponible.",
    );
  const { data: stores } = await query.graph(
    {
      entity: "store",
      fields: ["default_sales_channel_id"],
      pagination: { take: 1 },
    },
    { cache: { enable: false } },
  );
  const channelId = stores[0]?.default_sales_channel_id;
  if (!channelId)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "El marketplace no tiene un canal de ventas configurado.",
    );
  const sets = location.fulfillment_sets ?? [];
  const name =
    type === "pickup"
      ? `usapeek · Recogida · ${sellerId}`
      : shippingSetName(sellerId);
  const set =
    sets.find((value) => value?.type === type && value.name === name) ??
    sets.find((value) => value?.type === type);
  if (set) {
    const { data: owners } = await query.graph(
      {
        entity: "location_fulfillment_set",
        fields: ["stock_location_id"],
        filters: { fulfillment_set_id: set.id },
      },
      { cache: { enable: false } },
    );
    if (owners.length !== 1 || owners[0].stock_location_id !== locationId)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El conjunto de envíos debe pertenecer solamente al almacén de esta tienda.",
      );
  }
  const zone = set?.service_zones?.find((value) => {
    const existing = value && zoneCoverage(value.geo_zones ?? []);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(coverage))
      return false;
    const codes = new Set(value?.geo_zones?.map((zone) => zone?.province_code));
    return coverageGeoZones(coverage).every(
      (zone) => !("province_code" in zone) || codes.has(zone.province_code),
    );
  });
  return {
    location_id: locationId,
    fulfillment_set_name: name,
    fulfillment_set_id: set?.id,
    service_zone_id: zone?.id,
    links: [
      ...(location.fulfillment_providers?.some(
        (value) => value?.id === SHIPPING_PROVIDER_ID,
      )
        ? []
        : [
            {
              [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
              [Modules.FULFILLMENT]: {
                fulfillment_provider_id: SHIPPING_PROVIDER_ID,
              },
            },
          ]),
      ...(location.sales_channels?.some((value) => value?.id === channelId)
        ? []
        : [
            {
              [Modules.SALES_CHANNEL]: { sales_channel_id: channelId },
              [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
            },
          ]),
    ] as LinkDefinition[],
  };
}
