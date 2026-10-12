import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { HttpTypes } from "@mercurjs/types";
import { sellerWarehouseView } from "../../../lib/vendor-warehouse/read";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorStockLocationResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const warehouse = await sellerWarehouseView(
    req.scope,
    req.seller_context!.seller_id,
  );
  res.json(warehouse);
}
