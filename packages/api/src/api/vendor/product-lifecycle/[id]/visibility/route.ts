import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { productLifecycleWorkflow } from "../../../../../workflows/product-lifecycle";
import type { ProductLifecycleResult } from "../../../../../lib/catalog-management/contracts";
import type { ProductVisibility } from "../../middlewares";

export async function POST(
  req: AuthenticatedMedusaRequest<ProductVisibility>,
  res: MedusaResponse<ProductLifecycleResult>,
) {
  const { result } = await productLifecycleWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
      operation: req.validatedBody.active ? "activate" : "deactivate",
    },
  });
  res.status(result.applied ? 200 : 202).json(result);
}
