import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  CatalogPermissionResponse,
  UpdateCatalogPermission,
} from "../../../../../lib/catalog-permission/contracts";
import { setSellerCatalogPermissionWorkflow } from "../../../../../workflows/set-seller-catalog-permission";

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateCatalogPermission>,
  res: MedusaResponse<CatalogPermissionResponse>,
) {
  const { result } = await setSellerCatalogPermissionWorkflow(req.scope).run({
    input: {
      seller_id: req.params.id!,
      actor_id: req.auth_context.actor_id,
      mode: req.validatedBody.mode,
    },
  });
  res.json({ catalog_permission: result });
}
