import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { onboardingService } from "../vendor-onboarding/access";
import { OnboardingError } from "../vendor-onboarding/errors";

export async function sellerWarehouseLinks(container: MedusaContainer, sellerId: string) {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "stock_location_seller", fields: ["stock_location_id", "seller_id"], filters: { seller_id: sellerId },
  }, { cache: { enable: false } });
  return data;
}

export async function requireSellerWarehouse(container: MedusaContainer, sellerId: string): Promise<string> {
  const [claims, links] = await Promise.all([
    onboardingService(container).listVendorWarehouses({ seller_id: sellerId, state: "ready" }),
    sellerWarehouseLinks(container, sellerId),
  ]);
  if (claims.length !== 1 || links.length !== 1 || links[0].stock_location_id !== claims[0].stock_location_id) throw new OnboardingError("warehouse_not_ready", 409);
  const id = claims[0].stock_location_id;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: locations }, { data: owners }] = await Promise.all([
    query.graph({ entity: "stock_location", fields: ["id"], filters: { id } }, { cache: { enable: false } }),
    query.graph({ entity: "stock_location_seller", fields: ["seller_id"], filters: { stock_location_id: id } }, { cache: { enable: false } }),
  ]);
  if (locations.length !== 1 || owners.length !== 1 || owners[0].seller_id !== sellerId) throw new OnboardingError("warehouse_conflict", 409);
  return id;
}

export async function assertSellerWarehouseLocations(container: MedusaContainer, sellerId: string, locationIds: string[]): Promise<string> {
  const warehouseId = await requireSellerWarehouse(container, sellerId);
  if (locationIds.some(id => id !== warehouseId)) throw new OnboardingError("inventory_scope_forbidden", 403);
  return warehouseId;
}
