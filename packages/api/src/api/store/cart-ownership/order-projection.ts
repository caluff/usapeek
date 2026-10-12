import { MedusaError } from "@medusajs/framework/utils";
import { defaultStoreCartFields } from "@medusajs/medusa/api/store/carts/query-config";
import { defaultStoreOrderFields, defaultStoreRetrieveOrderFields } from "@medusajs/medusa/api/store/orders/query-config";
import { defaultStoreRetrieveOrderGroupFields } from "@mercurjs/core/api/store/carts/[id]/complete/query-config";
import { storeOrderGroupFields } from "@mercurjs/core/api/store/order-groups/query-config";

const normalizeDefault = (field: string) => field.startsWith("*") ? `${field.slice(1)}.*` : field;

const orderFields = new Set([
  ...defaultStoreOrderFields,
  ...defaultStoreRetrieveOrderFields.map(normalizeDefault),
  ...storeOrderGroupFields.filter((field) => field.startsWith("orders.")).map((field) => field.slice("orders.".length)),
  ...defaultStoreCartFields.filter((field) => field.startsWith("shipping_address.") || field.startsWith("billing_address.")),
  "customer_id",
  "metadata",
  "items.product_handle",
  "items.variant.product.thumbnail",
  "items.variant.product.images.url",
  "shipping_methods.shipping_option.metadata",
  "shipping_methods.shipping_option.service_zone.fulfillment_set.type",
  "fulfillments.shipping_option.metadata",
  "fulfillments.shipping_option.service_zone.fulfillment_set.type",
  "fulfillments.*",
  "fulfillments.id",
  "fulfillments.created_at",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "fulfillments.items.line_item_id",
  "fulfillments.items.quantity",
]);

const orderGroupFields = new Set([
  ...defaultStoreRetrieveOrderGroupFields,
  ...storeOrderGroupFields,
  ...Array.from(orderFields, (field) => `orders.${field}`),
  "orders.*",
]);

export function assertStoreOrderProjection(fields: readonly string[], resource: "order" | "order_group") {
  const allowed = resource === "order" ? orderFields : orderGroupFields;
  // The native `allowed` filter depends on a feature flag and accepts prefixes.
  // Check exact normalized paths at the route boundary: owning an order never
  // permits following region/customer/product links into another buyer's data.
  if (fields.some((field) => !allowed.has(field))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Requested order fields are not available.");
  }
}
