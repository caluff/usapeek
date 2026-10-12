import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import type InventoryModuleService from "../../modules/inventory/service";
import { requireVendorAccess } from "../vendor-onboarding/access";
import { vendorInventoryAdjustmentSchema, type VendorInventoryAdjustment } from "./validation";

export type UpdateVendorStockInput = VendorInventoryAdjustment & { member_id: string; seller_id: string };

export async function updateVendorStock(container: MedusaContainer, input: UpdateVendorStockInput) {
  await requireVendorAccess(container, input.member_id, input.seller_id);
  const adjustment = vendorInventoryAdjustmentSchema.parse({
    inventory_item_id: input.inventory_item_id,
    location_id: input.location_id,
    expected_quantity: input.expected_quantity,
    stocked_quantity: input.stocked_quantity,
  });
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: items }, { data: locations }] = await Promise.all([
    query.graph({ entity: "inventory_item_seller", fields: ["inventory_item_id"], filters: { seller_id: input.seller_id, inventory_item_id: input.inventory_item_id } }, { cache: { enable: false } }),
    query.graph({ entity: "stock_location_seller", fields: ["stock_location_id"], filters: { seller_id: input.seller_id, stock_location_id: input.location_id } }, { cache: { enable: false } }),
  ]);
  if (!items.length || !locations.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Inventory level not found for this seller.");
  const inventory = container.resolve<InventoryModuleService>(Modules.INVENTORY);
  return inventory.compareAndSetInventory(adjustment);
}
