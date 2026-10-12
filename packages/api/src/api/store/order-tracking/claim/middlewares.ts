import { authenticate, validateAndTransformBody, type MiddlewareRoute } from "@medusajs/framework/http";
import { StoreOrderTrackingClaimInputSchema } from "../../../../lib/order-tracking/claim-contracts";

export const orderTrackingClaimMiddlewares: MiddlewareRoute[] = [{
  matcher: "/store/order-tracking/claim",
  method: "POST",
  middlewares: [authenticate("customer", ["session", "bearer"]), validateAndTransformBody(StoreOrderTrackingClaimInputSchema)],
}];
