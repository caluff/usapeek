import { validateAndTransformBody, type MiddlewareRoute } from "@medusajs/framework/http";
import { StoreOrderTrackingInputSchema } from "../../../lib/order-tracking/contracts";

export const orderTrackingMiddlewares: MiddlewareRoute[] = [{
  matcher: "/store/order-tracking",
  method: "POST",
  // No customer session: the signature authorizes read-only access to one order.
  middlewares: [validateAndTransformBody(StoreOrderTrackingInputSchema)],
}];
