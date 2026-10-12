import type { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { OnboardingError } from "../vendor-onboarding/errors";
import { requireSellerWarehouse } from "../vendor-warehouse/access";

const shippingResource =
  /^\/vendor\/(?:shipping-profiles|shipping-options|shipping-option-types|fulfillment-sets)(?:\/|$)/;
const warehouseShippingResource =
  /^\/vendor\/stock-locations\/[^/]+\/(?:fulfillment-sets|fulfillment-providers|sales-channels)(?:\/|$)/;

// Run after live membership resolution. Shipping writes use the configuration
// workflow so its lock, US/USD policy and warehouse invariants cannot be bypassed.
export async function guardSellerShipping(
  req: MedusaRequest,
  sellerId: string,
) {
  const route = req.originalUrl.split("?")[0].replace(/\/+$/, "");
  if (req.method === "OPTIONS") return;
  if (!shippingResource.test(route) && !warehouseShippingResource.test(route))
    return;
  const deletion = route.match(
    /^\/vendor\/(shipping-profiles|shipping-options)\/([^/]+)$/,
  );
  if (req.method === "DELETE" && deletion) {
    const resource =
      deletion[1] === "shipping-profiles"
        ? "shipping_profile"
        : "shipping_option";
    const { data: owners } = await req.scope
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: `${resource}_seller`,
          fields: ["seller_id"],
          filters: {
            [`${resource}_id`]: decodeURIComponent(deletion[2]),
            seller_id: sellerId,
          },
        },
        { cache: { enable: false } },
      );
    if (owners.length !== 1)
      throw new OnboardingError("shipping_configuration_not_found", 404);
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    throw new OnboardingError("shipping_configuration_required", 403);
  }

  const match = route.match(
    /^\/vendor\/fulfillment-sets\/([^/]+)(?:\/service-zones(?:\/([^/]+))?)?$/,
  );
  if (!match) return; // Other native reads already enforce seller ownership.
  const fulfillmentSetId = decodeURIComponent(match[1]);
  const warehouseId = await requireSellerWarehouse(req.scope, sellerId);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: links } = await query.graph(
    {
      entity: "location_fulfillment_set",
      fields: ["stock_location_id"],
      filters: { fulfillment_set_id: fulfillmentSetId },
    },
    { cache: { enable: false } },
  );
  if (links.length !== 1 || links[0].stock_location_id !== warehouseId) {
    throw new OnboardingError("shipping_configuration_not_found", 404);
  }
  if (match[2]) {
    // Native Mercur GET checks the parent owner but queries the child by ID only.
    const { data: zones } = await query.graph(
      {
        entity: "service_zone",
        fields: ["id"],
        filters: {
          id: decodeURIComponent(match[2]),
          fulfillment_set_id: fulfillmentSetId,
        },
      },
      { cache: { enable: false } },
    );
    if (zones.length !== 1)
      throw new OnboardingError("shipping_configuration_not_found", 404);
  }
}
