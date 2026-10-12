import type {
  GeoZoneDTO,
  HttpTypes,
  ShippingOptionDTO,
  ShippingOptionRuleDTO,
  ShippingOptionTypeDTO,
} from "@medusajs/types"
import type { OfferDTO } from "@mercurjs/types"
import { createCatalogSdk } from "@/lib/catalog-sdk"
import { validateStorefrontEnvironment } from "@/lib/storefront-config"

export type ProductShippingMethod = Pick<ShippingOptionDTO, "id" | "name"> & {
  type: Pick<ShippingOptionTypeDTO, "label" | "description"> | null
}

type ShippingOption = ProductShippingMethod &
  Pick<ShippingOptionDTO, "shipping_profile_id"> & {
    seller?: Pick<NonNullable<OfferDTO["seller"]>, "id"> | null
    provider?: Pick<HttpTypes.AdminFulfillmentProvider, "is_enabled"> | null
    rules?: Pick<ShippingOptionRuleDTO, "attribute" | "operator" | "value">[]
    service_zone?: { geo_zones?: Pick<GeoZoneDTO, "country_code">[] }
  }
type ShippingOffer = Pick<
  OfferDTO,
  "id" | "seller_id" | "shipping_profile_id"
> & {
  shipping_profile?: { shipping_options?: ShippingOption[] } | null
}

function matchesRule(rule: NonNullable<ShippingOption["rules"]>[number]) {
  const expected =
    rule.attribute === "enabled_in_store"
      ? "true"
      : rule.attribute === "is_return"
        ? "false"
        : undefined
  // Other rules need the eventual cart/address context, not a PDP estimate.
  if (expected === undefined) return true
  const raw: unknown = rule.value
  const value =
    raw && typeof raw === "object" && "value" in raw ? raw.value : raw
  const values = Array.isArray(value) ? value : [value]
  const matches = values.includes(expected)
  if (rule.operator === "eq" || rule.operator === "in") return matches
  if (rule.operator === "ne" || rule.operator === "nin") return !matches
  return false
}

export function productShippingMethods(
  offer: ShippingOffer,
): ProductShippingMethod[] {
  return (offer.shipping_profile?.shipping_options ?? [])
    .filter(
      (option) =>
        option.seller?.id === offer.seller_id &&
        option.shipping_profile_id === offer.shipping_profile_id &&
        option.provider?.is_enabled === true &&
        option.service_zone?.geo_zones?.some(
          (zone) => zone.country_code.toLowerCase() === "us",
        ) &&
        (option.rules ?? []).every(matchesRule),
    )
    .map(({ id, name, type }) => ({
      id,
      name,
      type: type ? { label: type.label, description: type.description } : null,
    }))
}

export async function requestProductShipping(
  offerId: string,
  signal: AbortSignal,
): Promise<ProductShippingMethod[]> {
  if (!/^offer_[a-zA-Z0-9]+$/.test(offerId))
    throw new Error("Selecciona una oferta válida.")
  const configuration = validateStorefrontEnvironment({
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  })
  if (configuration.status !== "valid")
    throw new Error("La tienda no está disponible.")
  const optionFields = [
    "id",
    "name",
    "shipping_profile_id",
    "type.label",
    "type.description",
    "seller.id",
    "provider.is_enabled",
    "rules.attribute",
    "rules.operator",
    "rules.value",
    "service_zone.geo_zones.country_code",
  ]
  const { offer } = await createCatalogSdk(
    configuration.config,
    signal,
  ).client.fetch<{ offer: ShippingOffer }>(`/store/offers/${offerId}`, {
    query: {
      fields: [
        "id",
        "seller_id",
        "shipping_profile_id",
        ...optionFields.map(
          (field) => `shipping_profile.shipping_options.${field}`,
        ),
      ].join(","),
    },
  })
  return productShippingMethods(offer)
}
