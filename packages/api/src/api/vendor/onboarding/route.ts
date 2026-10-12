import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { onboardingHttp } from "../../../lib/vendor-onboarding/http";
import { vendorOnboardingResponse } from "../../../lib/vendor-onboarding/views";
import type { VendorOnboardingResponse } from "../../../lib/vendor-onboarding/schemas";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<VendorOnboardingResponse>) {
  return onboardingHttp(res, async () => res.json(await vendorOnboardingResponse(req.scope, req.auth_context.actor_id, req.get("x-seller-id") || "")));
}
