import { MedusaError } from "@medusajs/framework/utils";
import { defaultPaymentCollectionFields } from "@medusajs/medusa/api/store/payment-collections/query-config";
import { defaultStoreShippingOptionsFields } from "@medusajs/medusa/api/store/shipping-options/query-config";
import { defaultStoreCartFields as medusaCartFields } from "@medusajs/medusa/api/store/carts/query-config";
import { defaultStoreCartFields as mercurCartFields } from "@mercurjs/core/api/store/carts/helpers";

const normalizeDefault = (field: string) => field.startsWith("*") ? `${field.slice(1)}.*` : field;

const cartFields = new Set([
  ...medusaCartFields.map(normalizeDefault),
  ...mercurCartFields.map(normalizeDefault),
  "customer_id",
  "items.*",
  "items.variant.*",
  "items.variant.options.*",
  "items.variant.product.*",
  "items.variant.product.images.*",
  "items.offer.*",
  "items.offer.seller.*",
  "region.*",
  "region.countries.iso_2",
  "shipping_address.*",
  "billing_address.*",
  "shipping_methods.*",
]);

const paymentFields = new Set([
  ...defaultPaymentCollectionFields.map(normalizeDefault),
  "payment_sessions.id",
  "payment_sessions.provider_id",
  "payment_sessions.status",
  "payment_sessions.data",
  "payment_sessions.amount",
  "payment_sessions.currency_code",
]);

const shippingFields = new Set([
  ...defaultStoreShippingOptionsFields,
  // These are the fixed fields read by Mercur's shipping-options workflow.
  "provider_id",
  "data",
  "service_zone.fulfillment_set_id",
  "service_zone.fulfillment_set.type",
  "service_zone.fulfillment_set.location.id",
  "service_zone.fulfillment_set.location.address.*",
  "type.id",
  "type.label",
  "type.description",
  "type.code",
  "provider.id",
  "provider.is_enabled",
  "rules.attribute",
  "rules.value",
  "rules.operator",
  "calculated_price.*",
  "prices.*",
  "prices.price_rules.*",
  "seller.id",
  "seller.name",
  "seller.handle",
]);

export function assertStoreCheckoutProjection(fields: readonly string[], resource: "cart" | "payment_collection" | "shipping_option") {
  const allowed = { cart: cartFields, payment_collection: paymentFields, shipping_option: shippingFields }[resource];
  // Relation wildcards select direct properties only. They never authorize
  // arbitrary descendants such as customer.groups.customers or reviews.order.
  if (fields.some((field) => !allowed.has(field))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Requested checkout fields are not available.");
  }
}
