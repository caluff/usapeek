import { authenticate, validateAndTransformBody, validateAndTransformQuery, type MiddlewareRoute, type AuthenticatedMedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { PolicyOperation } from "@medusajs/framework/utils";
import { SaveApplicationBodySchema, SubmitApplicationBodySchema, ReviewApplicationBodySchema, PaginationSchema, AdminApplicationQuerySchema, ReadNotificationsBodySchema } from "../../../lib/vendor-onboarding/schemas";
import { vendorLiveGuard, managedSellerGuard } from "../../../lib/vendor-onboarding/native-guards";
import { onboardingHttp } from "../../../lib/vendor-onboarding/http";
import { OnboardingError } from "../../../lib/vendor-onboarding/errors";
import { enableReadOnlyAccessScope } from "../../../lib/vendor-onboarding/access";
import { protectSubmission } from "../../../lib/spam-protection/middleware";

function readOnlyAccessScope(req: AuthenticatedMedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  if (req.method === "GET" || req.method === "HEAD") enableReadOnlyAccessScope(req.scope);
  next();
}

function humanReviewer(req: AuthenticatedMedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  return onboardingHttp(res, async () => {
    if (req.auth_context?.actor_type !== "user" || !req.auth_context.auth_identity_id) throw new OnboardingError("review_forbidden", 403);
    next();
  });
}
export const vendorApplicationMiddlewares: MiddlewareRoute[] = [
  { matcher: /^\/store\/vendor-application(?:\/.*)?$/, bodyParser: { sizeLimit: "32kb" }, middlewares: [authenticate("customer", ["session", "bearer"]), protectSubmission, readOnlyAccessScope] },
  { matcher: "/store/vendor-application", method: "POST", middlewares: [validateAndTransformBody(SaveApplicationBodySchema)] },
  { matcher: "/store/vendor-application/submit", method: "POST", middlewares: [validateAndTransformBody(SubmitApplicationBodySchema)] },
  { matcher: "/store/vendor-application/verification", method: "POST", middlewares: [validateAndTransformBody(z.strictObject({}))] },
  { matcher: "/store/vendor-application/notifications", method: "GET", middlewares: [validateAndTransformQuery(PaginationSchema, {})] },
  { matcher: "/store/vendor-application/notifications/read", method: "POST", middlewares: [validateAndTransformBody(ReadNotificationsBodySchema)] },
  { matcher: /^\/admin\/vendor-applications(?:\/.*)?$/, bodyParser: { sizeLimit: "32kb" }, middlewares: [authenticate("user", ["session", "bearer"]), humanReviewer] },
  { matcher: "/admin/vendor-applications", method: "GET", middlewares: [validateAndTransformQuery(AdminApplicationQuerySchema, {})], policies: [{ resource: "seller", operation: PolicyOperation.read }] },
  { matcher: "/admin/vendor-applications/:id", method: "GET", policies: [{ resource: "seller", operation: PolicyOperation.read }] },
  { matcher: "/admin/vendor-applications/:id/review", method: "POST", middlewares: [validateAndTransformBody(ReviewApplicationBodySchema)], policies: [{ resource: "seller", operation: PolicyOperation.update }] },
  { matcher: "/vendor/*", middlewares: [vendorLiveGuard] },
  { matcher: /^\/admin\/sellers(?:\/.*)?$/, middlewares: [managedSellerGuard] },
  { matcher: "/vendor/onboarding", method: "GET", policies: [{ resource: "seller", operation: PolicyOperation.read }] },
];
