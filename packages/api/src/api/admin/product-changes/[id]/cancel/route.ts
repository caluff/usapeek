import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { AdminCancelProductChangeType } from "@mercurjs/core/api/admin/product-changes/validators";
import { resolveAdminCatalogProductChangeWorkflow } from "../../../../../workflows/resolve-admin-catalog-product-change";

export async function POST(
  req: AuthenticatedMedusaRequest<AdminCancelProductChangeType>,
  res: MedusaResponse,
) {
  await resolveAdminCatalogProductChangeWorkflow(req.scope).run({
    input: {
      change_id: req.params.id,
      actor_id: req.auth_context.actor_id,
      mode: "cancel",
      additional_data: req.validatedBody.additional_data,
    },
  });
  const {
    data: [product_change],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "product_change",
      fields: ["*", "actions.*"],
      filters: { id: req.params.id },
    },
    { cache: { enable: false } },
  );
  if (!product_change)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Product change not found.",
    );
  res.json({ product_change });
}
