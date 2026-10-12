import { authenticate, type AuthenticatedMedusaRequest, type MedusaNextFunction, type MedusaRequest, type MedusaResponse, type MiddlewareRoute } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { asValue } from "@medusajs/framework/awilix";
import { z } from "@medusajs/framework/zod";
import { STORE_CART_BUYER_CONTEXT, validateCartOwnershipWorkflow } from "../../../workflows/validate-cart-ownership";

const cartReference = z.object({ cart_id: z.string().min(1) });
const cartEmail = z.object({ email: z.string().nullish() });
type OptionalCustomerRequest = MedusaRequest<unknown, object> & Partial<Pick<AuthenticatedMedusaRequest, "auth_context">>;
export const STORE_CART_OWNERSHIP_RESOURCE = "storeCartOwnershipResource";

export async function guardStoreCartOwnership(req: OptionalCustomerRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const rawPath = req.originalUrl.split("?")[0];
    if (/%2f|%5c/i.test(rawPath)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid resource path.");
    }
    let segments: string[];
    try {
      segments = rawPath.split("/").map((segment) => decodeURIComponent(segment));
    } catch {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid resource path.");
    }
    const resource = segments[2]?.toLowerCase();
    const id = segments[3];
    const action = segments[4]?.toLowerCase();
    const customerId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined;
    const workflow = validateCartOwnershipWorkflow(req.scope);
    let cartId: string | undefined;

    if (resource === "carts") {
      const body = cartEmail.safeParse(req.method === "POST" && !action ? req.body ?? {} : {});
      if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid cart email.");
      if (!id) {
        next();
        return;
      }
      await workflow.run({ input: {
        resource: "cart", id, customer_id: customerId, email: body.data.email,
        operation: req.method === "GET" ? "read" : action === "customer" ? "transfer" : action === "complete" ? "complete" : "update",
      } });
      cartId = id;
      if (req.method === "POST" && action === "complete") {
        req.scope.register({ [STORE_CART_BUYER_CONTEXT]: asValue({ customer_id: customerId }) });
      }
    } else if (resource === "orders" && id) {
      const cartId = req.headers["x-marketplace-cart-id"];
      await workflow.run({ input: {
        resource: "order", id, customer_id: customerId,
        cart_id: typeof cartId === "string" ? cartId : undefined,
      } });
    } else if (resource === "payment-collections" && id) {
      const { result } = await workflow.run({ input: { resource: "payment_collection", id, customer_id: customerId } });
      cartId = "cart_id" in result && typeof result.cart_id === "string" ? result.cart_id : undefined;
    } else {
      const body = cartReference.safeParse(req.method === "GET" ? req.query : req.body);
      if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A valid cart_id is required.");
      await workflow.run({ input: {
        resource: "cart", id: body.data.cart_id, customer_id: customerId,
        operation: resource === "payment-collections" ? "payment" : "read",
      } });
      cartId = body.data.cart_id;
    }
    if (cartId) req.scope.register({ [STORE_CART_OWNERSHIP_RESOURCE]: asValue({ cart_id: cartId }) });
    next();
  } catch (error) {
    next(error);
  }
}

const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true });

export function denyStoreOrderTransfer(_req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  next(new MedusaError(MedusaError.Types.INVALID_DATA, "Order transfers are unavailable."));
}

export const storeCartOwnershipMiddlewares: MiddlewareRoute[] = [
  // Order reassignment is not a storefront capability. The native request
  // endpoint returns order details before the previous buyer accepts it.
  {
    matcher: /^\/store\/orders\/[^/]+\/transfer\/(?:request|cancel|accept|decline)\/?$/i,
    method: "POST",
    middlewares: [denyStoreOrderTransfer],
  },
  // Native cart creation uses auth_context.actor_id when authentication exists.
  { matcher: "/store/carts", method: "POST", middlewares: [optionalCustomer, guardStoreCartOwnership] },
  {
    matcher: /^\/store\/carts\/[^/]+(?:\/.*)?$/i,
    method: ["GET", "POST", "DELETE"],
    middlewares: [optionalCustomer, guardStoreCartOwnership],
  },
  { matcher: "/store/shipping-options", method: "GET", middlewares: [optionalCustomer, guardStoreCartOwnership] },
  { matcher: "/store/shipping-options/:id/calculate", method: "POST", middlewares: [optionalCustomer, guardStoreCartOwnership] },
  { matcher: "/store/payment-collections", method: "POST", middlewares: [optionalCustomer, guardStoreCartOwnership] },
  { matcher: "/store/payment-collections/:id/payment-sessions", method: "POST", middlewares: [optionalCustomer, guardStoreCartOwnership] },
  { matcher: "/store/orders/:id", method: "GET", middlewares: [optionalCustomer, guardStoreCartOwnership] },
];
