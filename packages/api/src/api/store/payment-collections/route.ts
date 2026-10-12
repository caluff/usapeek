import { POST as createPaymentCollection } from "@medusajs/medusa/api/store/payment-collections/route";
import { withStoreCartOwnership } from "../cart-ownership/route-guard";
import { validateCartSaleStatusWorkflow } from "../../../workflows/validate-cart-sale-status";

export async function POST(req: Parameters<typeof createPaymentCollection>[0], res: Parameters<typeof createPaymentCollection>[1]) {
  return withStoreCartOwnership(req, res, async (request, response) => {
    await validateCartSaleStatusWorkflow(request.scope).run({ input: { operation: "checkout", cart_id: request.body.cart_id } });
    return createPaymentCollection(request, response);
  });
}
