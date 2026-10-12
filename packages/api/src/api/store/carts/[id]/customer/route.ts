import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { AdditionalData } from "@medusajs/framework/types";
import { refetchCart } from "@medusajs/medusa/api/store/carts/helpers";
import { transferStoreCartWorkflow } from "../../../../../workflows/store-cart-ownership";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";

export async function POST(req: AuthenticatedMedusaRequest<AdditionalData>, res: MedusaResponse) {
  return withStoreCartOwnership(req, res, transferCart);
}

async function transferCart(req: AuthenticatedMedusaRequest<AdditionalData>, res: MedusaResponse) {
  await transferStoreCartWorkflow(req.scope).run({ input: {
    id: req.params.id, customer_id: req.auth_context.actor_id, additional_data: req.validatedBody.additional_data,
  } });
  const cart = await refetchCart(req.params.id, req.scope, req.queryConfig.fields);
  res.status(200).json({ cart });
}
