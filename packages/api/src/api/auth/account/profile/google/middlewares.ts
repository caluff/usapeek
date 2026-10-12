import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";

export const googlePanelProfileMiddlewares: MiddlewareRoute[] = [{
  matcher: "/auth/account/profile/google",
  method: "POST",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"]), validateAndTransformBody(z.strictObject({}))],
}];
