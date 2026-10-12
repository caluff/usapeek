import { POST as updateLineItem, DELETE as deleteLineItem } from "@medusajs/medusa/api/store/carts/[id]/line-items/[line_id]/route";
import { withStoreCartOwnership } from "../../../../cart-ownership/route-guard";
import { validateCartSaleStatusWorkflow } from "../../../../../../workflows/validate-cart-sale-status";

export async function POST(req: Parameters<typeof updateLineItem>[0], res: Parameters<typeof updateLineItem>[1]) {
  return withStoreCartOwnership(req, res, async (request, response) => {
    if (request.validatedBody.quantity !== undefined) {
      await validateCartSaleStatusWorkflow(request.scope).run({ input: {
        operation: "update", cart_id: request.params.id, line_id: request.params.line_id,
        quantity: request.validatedBody.quantity,
      } });
    }
    return updateLineItem(request, response);
  });
}

export async function DELETE(req: Parameters<typeof deleteLineItem>[0], res: Parameters<typeof deleteLineItem>[1]) {
  return withStoreCartOwnership(req, res, deleteLineItem);
}
