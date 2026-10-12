import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import { CompleteGoogleAuth } from "./validators";

export const googleAuthMiddlewares: MiddlewareRoute[] = [{
  matcher: "/auth/google/complete",
  method: "POST",
  middlewares: [
    authenticate(["customer", "user", "member"], "bearer", { allowUnregistered: true }),
    validateAndTransformBody(CompleteGoogleAuth),
  ],
}];
