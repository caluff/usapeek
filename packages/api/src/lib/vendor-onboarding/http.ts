import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { OnboardingError } from "./errors";

const ERROR_STATUS: Record<string, number> = {
  invalid_application: 400, invalid_categories: 400, invalid_currency: 400,
  verification_required: 403, not_eligible: 403, member_inactive: 403, seller_not_open: 403,
  seller_required: 403, seller_membership_required: 403, application_not_approved: 403,
  review_forbidden: 403, seller_registration_disabled: 403, managed_seller_write_forbidden: 403, inventory_scope_forbidden: 403,
  application_not_found: 404, notification_not_found: 404, product_not_found: 404,
  version_conflict: 409, invalid_transition: 409, application_exists: 409, existing_vendor_account: 409,
  identity_changed: 409, member_identity_conflict: 409, store_name_taken: 409, store_handle_taken: 409, store_email_taken: 409,
  mutation_conflict: 409, approval_in_progress: 409, approval_failed: 409, approval_recovery_required: 409,
  verification_rate_limited: 429, email_service_unconfigured: 503, catalog_unconfigured: 503,
};

export const applicantFromRequest = (req: AuthenticatedMedusaRequest) => ({ customer_id: req.auth_context.actor_id, auth_identity_id: req.auth_context.auth_identity_id });
export async function onboardingHttp(res: MedusaResponse, run: () => Promise<unknown>) {
  res.setHeader("Cache-Control", "private, no-store");
  try { return await run(); }
  catch (error) {
    // Persisted workflow errors are plain objects after serialization, not class instances.
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (typeof code === "string" && ERROR_STATUS[code]) {
      const status = ERROR_STATUS[code];
      if (status === 429) res.setHeader("Retry-After", "60");
      return res.status(status).json({ type: status === 403 ? "not_allowed" : status === 404 ? "not_found" : status === 400 ? "invalid_data" : "conflict", code, message: code });
    }
    if (error instanceof OnboardingError) {
      if (error.status === 429) res.setHeader("Retry-After", "60");
      return res.status(error.status).json({ type: error.type, code: error.code, message: error.message });
    }
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) return res.status(404).json({ type: error.type, code: "application_not_found", message: "Application not found" });
    if (error instanceof MedusaError && error.type === MedusaError.Types.INVALID_DATA) return res.status(400).json({ type: error.type, code: "invalid_application", message: "Invalid application data" });
    return res.status(500).json({ type: "unexpected_error", code: "onboarding_error", message: "The request could not be completed" });
  }
}
