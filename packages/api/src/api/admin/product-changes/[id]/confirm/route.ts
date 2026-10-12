import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { AdminConfirmProductChangeType } from "@mercurjs/core/api/admin/product-changes/validators";
import { resolveAdminCatalogProductChangeWorkflow } from "../../../../../workflows/resolve-admin-catalog-product-change";

export async function POST(
  req: AuthenticatedMedusaRequest<AdminConfirmProductChangeType>,
  res: MedusaResponse,
) {
  await resolveAdminCatalogProductChangeWorkflow(req.scope).run({
    input: {
      change_id: req.params.id,
      actor_id: req.auth_context.actor_id,
      mode: "confirm",
      internal_note: req.validatedBody.internal_note,
      additional_data: req.validatedBody.additional_data,
    },
  });
  res.json({ id: req.params.id, object: "product_change", deleted: true });
}
