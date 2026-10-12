import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { InventoryLevelDTO } from "@medusajs/framework/types";
import type { VendorInventoryAdjustment } from "../../../lib/inventory/validation";
import { updateVendorStockWorkflow } from "../../../workflows/update-vendor-stock";

export async function POST(req: AuthenticatedMedusaRequest<VendorInventoryAdjustment>, res: MedusaResponse<{ inventory_level: InventoryLevelDTO }>) {
  const { result } = await updateVendorStockWorkflow(req.scope).run({ input: {
    ...req.validatedBody,
    member_id: req.auth_context.actor_id,
    seller_id: req.get("x-seller-id") || "",
  } });
  res.json({ inventory_level: result });
}
