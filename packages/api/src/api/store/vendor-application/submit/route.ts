import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { applicantFromRequest, onboardingHttp } from "../../../../lib/vendor-onboarding/http";
import type { SubmitApplicationBody, ApplicationResponse } from "../../../../lib/vendor-onboarding/schemas";
import { applicantResponse } from "../../../../lib/vendor-onboarding/views";
import { mutateVendorApplicationWorkflow } from "../../../../workflows/mutate-vendor-application";
export async function POST(req: AuthenticatedMedusaRequest<SubmitApplicationBody>, res: MedusaResponse<ApplicationResponse>) {
  return onboardingHttp(res, async () => {
    const applicant = applicantFromRequest(req);
    await mutateVendorApplicationWorkflow(req.scope).run({ input: { operation: "submit", applicant, body: req.validatedBody } });
    return res.json(await applicantResponse(req.scope, applicant));
  });
}
