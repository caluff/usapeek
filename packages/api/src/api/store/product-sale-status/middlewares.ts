import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { StoreAddCartLineItem } from "@mercurjs/core/api/store/carts/[id]/line-items/validators";
import { StoreUpdateCartLineItem } from "@medusajs/medusa/api/store/carts/validators";
import { validateCartSaleStatusWorkflow } from "../../../workflows/validate-cart-sale-status";

// Parse only what the preflight needs, without changing the native request body
// or replacing Mercur's complete validation and inventory checks.
const addInput = z.object({ offer_id: StoreAddCartLineItem.shape.offer_id });
const updateInput = z.object({
  quantity: StoreUpdateCartLineItem.shape.quantity.optional(),
});

export async function validateAddedProductSale(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  try {
    const body = addInput.safeParse(req.body);
    if (!body.success)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A valid offer is required.",
      );
    await validateCartSaleStatusWorkflow(req.scope).run({
      input: { operation: "add", offer_id: body.data.offer_id },
    });
    next();
  } catch (error) {
    next(error);
  }
}

export async function validateUpdatedProductSale(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  try {
    const body = updateInput.safeParse(req.body);
    if (!body.success)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A valid quantity is required.",
      );
    if (body.data.quantity !== undefined) {
      await validateCartSaleStatusWorkflow(req.scope).run({
        input: {
          operation: "update",
          cart_id: req.params.id,
          line_id: req.params.line_id,
          quantity: body.data.quantity,
        },
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

export const storeProductSaleStatusMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/carts/:id/line-items",
    method: "POST",
    middlewares: [validateAddedProductSale],
  },
  {
    matcher: "/store/carts/:id/line-items/:line_id",
    method: "POST",
    middlewares: [validateUpdatedProductSale],
  },
];
