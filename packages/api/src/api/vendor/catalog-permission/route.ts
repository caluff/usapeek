import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { CatalogPermissionResponse } from "../../../lib/catalog-permission/contracts";
import { readCatalogPermission } from "../../../lib/catalog-permission/read";
import { requireVendorAccess } from "../../../lib/vendor-onboarding/access";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<CatalogPermissionResponse>,
) {
  const sellerId = req.seller_context?.seller_id ?? "";
  await requireVendorAccess(req.scope, req.auth_context.actor_id, sellerId);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    catalog_permission: await readCatalogPermission(req.scope, sellerId),
  });
}
