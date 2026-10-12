import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import { ConfirmAccountEmailVerification, RequestAccountEmailVerification } from "./validators";
import { protectSubmission } from "../../../../lib/spam-protection/middleware";

export const accountEmailVerificationMiddlewares: MiddlewareRoute[] = [{
  matcher: "/auth/account/email-verification",
  method: "GET",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"])],
}, {
  matcher: "/auth/account/email-verification/request",
  method: "POST",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"]), validateAndTransformBody(RequestAccountEmailVerification), protectSubmission],
}, {
  matcher: "/auth/account/email-verification/confirm",
  method: "POST",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"]), validateAndTransformBody(ConfirmAccountEmailVerification), protectSubmission],
}];
