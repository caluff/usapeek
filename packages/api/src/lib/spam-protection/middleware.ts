import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import type SpamProtectionService from "../../modules/spam-protection/service";
import { SPAM_PROTECTION_MODULE } from "../../modules/spam-protection";
import { spamProtectionBuckets } from "./policy";
import { submissionNetwork } from "./network";

export async function protectSubmission(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const context = "auth_context" in req ? req.auth_context : undefined;
  const authIdentityId =
    context &&
    typeof context === "object" &&
    "auth_identity_id" in context &&
    typeof context.auth_identity_id === "string"
      ? context.auth_identity_id
      : undefined;
  const buckets = spamProtectionBuckets({
    method: req.method,
    // Mounted middleware strips its matcher from req.path; originalUrl retains it.
    path: req.originalUrl.split("?")[0],
    ip: submissionNetwork(req),
    body: req.body,
    authIdentityId,
  });
  if (!buckets.length) return next();
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const limiter = req.scope.resolve<SpamProtectionService>(
      SPAM_PROTECTION_MODULE,
    );
    const retryAfter = await limiter.consume(buckets);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        type: "rate_limited",
        code: "too_many_requests",
        message: "Demasiados intentos. Espera antes de volver a intentarlo.",
      });
    }
  } catch {
    // A Redis outage must not silently disable protection or expose diagnostics.
    res.setHeader("Retry-After", "30");
    return res.status(503).json({
      type: "unavailable",
      code: "spam_protection_unavailable",
      message:
        "No podemos procesar esta solicitud ahora. Vuelve a intentarlo en unos instantes.",
    });
  }
  return next();
}

function protectProviderSubmission(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  // Parameter matchers also cover /auth/verification/request and /auth/google/complete.
  // Those use exact matchers below, after their native authentication middleware.
  if (!["customer", "user", "member"].includes(req.params.actor_type))
    return next();
  return protectSubmission(req, res, next);
}

export const spamProtectionMiddlewares: MiddlewareRoute[] = [
  ...[
    "/auth/:actor_type/:auth_provider",
    "/auth/:actor_type/:auth_provider/register",
    "/auth/:actor_type/:auth_provider/reset-password",
    "/auth/:actor_type/:auth_provider/update",
    "/auth/:actor_type/:auth_provider/callback",
  ].map((matcher): MiddlewareRoute => ({
    matcher,
    method: "POST",
    middlewares: [protectProviderSubmission],
  })),
  ...[
    "/auth/verification/request",
    "/auth/verification/confirm",
    "/auth/google/complete",
    "/auth/mfa/challenges/:id/verify",
    "/auth/google/one-tap/transaction",
    "/store/customers",
    "/store/order-tracking",
    "/store/order-tracking/claim",
  ].map((matcher): MiddlewareRoute => ({
    matcher,
    method: "POST",
    middlewares: [protectSubmission],
  })),
];
