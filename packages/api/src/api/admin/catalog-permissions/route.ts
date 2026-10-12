import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  CatalogPermissionListQuery,
  CatalogPermissionListResponse,
} from "../../../lib/catalog-permission/contracts";
import { readCatalogPermissions } from "../../../lib/catalog-permission/read";
import { requireReviewer } from "../../../lib/vendor-onboarding/access";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, CatalogPermissionListQuery>,
  res: MedusaResponse<CatalogPermissionListResponse>,
) {
  await requireReviewer(req.scope, req.auth_context.actor_id, "read");
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    catalog_permissions: await readCatalogPermissions(
      req.scope,
      req.validatedQuery.seller_ids,
    ),
  });
}
