import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { SaveApplicationBody, ApplicationResponse } from "../../../lib/vendor-onboarding/schemas";
import { applicantFromRequest, onboardingHttp } from "../../../lib/vendor-onboarding/http";
import { applicantResponse } from "../../../lib/vendor-onboarding/views";
import { mutateVendorApplicationWorkflow } from "../../../workflows/mutate-vendor-application";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<ApplicationResponse>) {
  return onboardingHttp(res, async () => res.json(await applicantResponse(req.scope, applicantFromRequest(req))));
}
export async function POST(req: AuthenticatedMedusaRequest<SaveApplicationBody>, res: MedusaResponse<ApplicationResponse>) {
  return onboardingHttp(res, async () => {
    const applicant = applicantFromRequest(req);
    const { result } = await mutateVendorApplicationWorkflow(req.scope).run({ input: { operation: "save", applicant, body: req.validatedBody } });
    return res.status(result.created ? 201 : 200).json(await applicantResponse(req.scope, applicant));
  });
}
