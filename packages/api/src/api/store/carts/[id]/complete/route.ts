import { MedusaError } from "@medusajs/framework/utils";
import { POST as completeCart } from "@mercurjs/core/api/store/carts/[id]/complete/route";
import { STORE_CART_BUYER_CONTEXT } from "../../../../../workflows/validate-cart-ownership";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";
import { assertStoreOrderProjection } from "../../../cart-ownership/order-projection";
import { validateCartSaleStatusWorkflow } from "../../../../../workflows/validate-cart-sale-status";

export async function POST(req: Parameters<typeof completeCart>[0], res: Parameters<typeof completeCart>[1]) {
  if (!req.scope.hasRegistration(STORE_CART_BUYER_CONTEXT)) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "A checkout buyer context is required.");
  }
  assertStoreOrderProjection(req.queryConfig.fields, "order_group");
  return withStoreCartOwnership(req, res, async (request, response) => {
    await validateCartSaleStatusWorkflow(request.scope).run({ input: { operation: "checkout", cart_id: request.params.id } });
    return completeCart(request, response);
  });
}
