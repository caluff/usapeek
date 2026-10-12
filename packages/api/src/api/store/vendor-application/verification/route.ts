import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { applicantFromRequest, onboardingHttp } from "../../../../lib/vendor-onboarding/http";
import { requestVendorApplicationVerificationWorkflow } from "../../../../workflows/vendor-application-notifications";
import type { VerificationResponse } from "../../../../lib/vendor-onboarding/schemas";
export async function POST(req: AuthenticatedMedusaRequest<Record<string, never>>, res: MedusaResponse<VerificationResponse>) {
  return onboardingHttp(res, async () => {
    res.setHeader("Cache-Control", "no-store");
    const { result } = await requestVendorApplicationVerificationWorkflow(req.scope).run({ input: { applicant: applicantFromRequest(req), ip: req.ip || req.socket.remoteAddress || "unknown" } });
    return res.status(202).json(result);
  });
}
