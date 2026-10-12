import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  VendorEarningsQuery,
  VendorEarningsResponse,
} from "../../../../lib/order-finance/contracts";
import { readVendorEarnings } from "../../../../lib/order-finance/vendor-earnings";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, VendorEarningsQuery>,
  res: MedusaResponse<VendorEarningsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    await readVendorEarnings(req.scope, {
      actor_id: req.auth_context.actor_id,
      seller_id: req.seller_context?.seller_id ?? "",
      query: req.validatedQuery,
    }),
  );
}
