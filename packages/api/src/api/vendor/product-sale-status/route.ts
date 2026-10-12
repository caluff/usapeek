import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { setProductSaleStatusWorkflow } from "../../../workflows/set-product-sale-status";
import type { ProductSaleStatus } from "./middlewares";

export async function POST(
  req: AuthenticatedMedusaRequest<ProductSaleStatus>,
  res: MedusaResponse,
) {
  const { result } = await setProductSaleStatusWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      seller_id: req.seller_context?.seller_id || "",
    },
  });
  res.json(result);
}
