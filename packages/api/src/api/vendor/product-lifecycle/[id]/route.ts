import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { readProductLifecycleState } from "../../../../lib/catalog/product-lifecycle";
import { requireVendorAccess } from "../../../../lib/vendor-onboarding/access";
import type { ProductLifecycleState } from "../../../../lib/catalog-management/contracts";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<ProductLifecycleState>,
) {
  const sellerId = req.seller_context?.seller_id || "";
  await requireVendorAccess(req.scope, req.auth_context.actor_id, sellerId);
  res.json(await readProductLifecycleState(req.scope, sellerId, req.params.id));
}
