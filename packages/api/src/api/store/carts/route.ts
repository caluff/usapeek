import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { AdditionalData, CreateCartWorkflowInputDTO, HttpTypes } from "@medusajs/framework/types";
import { refetchCart } from "@medusajs/medusa/api/store/carts/helpers";
import { createStoreCartWorkflow } from "../../../workflows/store-cart-ownership";
import { assertStoreCheckoutProjection } from "../cart-ownership/checkout-projection";

export async function POST(req: MedusaRequest<HttpTypes.StoreCreateCart>, res: MedusaResponse) {
  assertStoreCheckoutProjection(req.queryConfig.fields, "cart");
  const auth = (req as Partial<AuthenticatedMedusaRequest>).auth_context;
  const input = {
    ...req.validatedBody,
    customer_id: auth?.actor_type === "customer" ? auth.actor_id : undefined,
  } as CreateCartWorkflowInputDTO & AdditionalData;
  const { result } = await createStoreCartWorkflow(req.scope).run({ input });
  const cart = await refetchCart(result.id, req.scope, req.queryConfig.fields);
  res.status(200).json({ cart });
}
