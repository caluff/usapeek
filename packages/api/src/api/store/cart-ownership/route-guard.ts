import { randomUUID } from "node:crypto";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { guardStoreCartOwnership, STORE_CART_OWNERSHIP_RESOURCE } from "./middlewares";
import { acquireStoreCartIdentityWorkflow } from "../../../workflows/store-cart-ownership";
import { assertStoreCheckoutProjection } from "./checkout-projection";

export async function withStoreCartOwnership<Request extends MedusaRequest<unknown, object>, Response extends MedusaResponse>(
  req: Request, res: Response, handler: (req: Request, res: Response) => Promise<unknown>,
) {
  if (!req.scope.hasRegistration(STORE_CART_OWNERSHIP_RESOURCE)) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "A checkout cart context is required.");
  }
  const { cart_id: cartId } = req.scope.resolve<{ cart_id: string }>(STORE_CART_OWNERSHIP_RESOURCE);
  const locking = req.scope.resolve(Modules.LOCKING);
  const key = `store-cart-owner:${cartId}`;
  const ownerId = randomUUID();
  // A separate identity lock covers validation, the native workflow, and its
  // response/refetch without reacquiring Medusa's own cart lock. No TTL may
  // release ownership while a slow native handler is still running.
  await acquireStoreCartIdentityWorkflow(req.scope).run({ input: { key, owner_id: ownerId } });
  try {
    await new Promise<void>((resolve, reject) => {
      void guardStoreCartOwnership(req, res, (error?: unknown) => error ? reject(error) : resolve());
    });
    if (req.scope.resolve<{ cart_id: string }>(STORE_CART_OWNERSHIP_RESOURCE).cart_id !== cartId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Resource not found.");
    }
    const [, , resource, , action] = req.originalUrl.split("?")[0].split("/").map((segment) => decodeURIComponent(segment).toLowerCase());
    if (resource === "carts" && action !== "complete") {
      assertStoreCheckoutProjection(req.queryConfig.fields, "cart");
    } else if (resource === "payment-collections") {
      assertStoreCheckoutProjection(req.queryConfig.fields, "payment_collection");
    } else if (resource === "shipping-options") {
      assertStoreCheckoutProjection(req.queryConfig.fields, "shipping_option");
    }
    return await handler(req, res);
  } finally {
    await locking.release(key, { ownerId });
  }
}
