import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { AdditionalData, HttpTypes, UpdateCartWorkflowInputDTO } from "@medusajs/framework/types";
import { refetchCart } from "@medusajs/medusa/api/store/carts/helpers";
import { updateStoreCartWorkflow } from "../../../../workflows/store-cart-ownership";
import { GET as retrieveCart } from "@medusajs/medusa/api/store/carts/[id]/route";
import { withStoreCartOwnership } from "../../cart-ownership/route-guard";

export async function GET(req: Parameters<typeof retrieveCart>[0], res: Parameters<typeof retrieveCart>[1]) {
  return withStoreCartOwnership(req, res, retrieveCart);
}

export async function POST(req: MedusaRequest<HttpTypes.StoreUpdateCart>, res: MedusaResponse) {
  return withStoreCartOwnership(req, res, updateCart);
}

async function updateCart(req: MedusaRequest<HttpTypes.StoreUpdateCart>, res: MedusaResponse) {
  const auth = (req as Partial<AuthenticatedMedusaRequest>).auth_context;
  await updateStoreCartWorkflow(req.scope).run({ input: {
    cart: { ...req.validatedBody, id: req.params.id } as UpdateCartWorkflowInputDTO & AdditionalData,
    customer_id: auth?.actor_type === "customer" ? auth.actor_id : undefined,
  } });
  const cart = await refetchCart(req.params.id, req.scope, req.queryConfig.fields);
  res.status(200).json({ cart });
}
