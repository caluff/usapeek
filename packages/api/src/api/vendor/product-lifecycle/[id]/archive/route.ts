import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { productLifecycleWorkflow } from "../../../../../workflows/product-lifecycle";
import type { ProductLifecycleResult } from "../../../../../lib/catalog-management/contracts";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<ProductLifecycleResult>,
) {
  const { result } = await productLifecycleWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
      operation: "archive",
    },
  });
  res.status(result.applied ? 200 : 202).json(result);
}
