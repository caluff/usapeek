import { z } from "@medusajs/framework/zod";

const inventoryId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const stockQuantity = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const vendorInventoryAdjustmentSchema = z.strictObject({
  inventory_item_id: inventoryId,
  location_id: inventoryId,
  expected_quantity: stockQuantity,
  stocked_quantity: stockQuantity,
});

export type VendorInventoryAdjustment = z.infer<typeof vendorInventoryAdjustmentSchema>;
