import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { applicantFromRequest, onboardingHttp } from "../../../../lib/vendor-onboarding/http";
import { applicationOptions } from "../../../../lib/vendor-onboarding/validation";
import { loadApplicant } from "../../../../lib/vendor-onboarding/access";
import type { ApplicationOptionsResponse } from "../../../../lib/vendor-onboarding/schemas";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<ApplicationOptionsResponse>) {
  return onboardingHttp(res, async () => {
    await loadApplicant(req.scope, applicantFromRequest(req));
    return res.json(await applicationOptions(req.scope));
  });
}
