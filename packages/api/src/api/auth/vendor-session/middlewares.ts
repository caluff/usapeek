import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import { ConsumeVendorSession } from "./validators";

export const vendorSessionMiddlewares: MiddlewareRoute[] = [
  { matcher: "/auth/vendor-session/issue", method: "POST", middlewares: [authenticate("customer", "bearer")] },
  { matcher: "/auth/vendor-session/consume", method: "POST", middlewares: [validateAndTransformBody(ConsumeVendorSession)] },
];
