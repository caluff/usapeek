import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  VendorSettlementsQuery,
  VendorSettlementsResponse,
} from "../../../../lib/order-finance/contracts";
import { readVendorSettlements } from "../../../../lib/order-finance/vendor-settlement-projection";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, VendorSettlementsQuery>,
  res: MedusaResponse<VendorSettlementsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const result = await readVendorSettlements(req.scope, {
    actor_id: req.auth_context.actor_id,
    seller_id: req.seller_context?.seller_id ?? "",
    query: req.validatedQuery,
  });
  res.json(result);
}
