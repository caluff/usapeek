import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { onboardingHttp } from "../../../../../lib/vendor-onboarding/http";
import { adminApplicationResponse } from "../../../../../lib/vendor-onboarding/views";
import { mutateVendorApplicationWorkflow } from "../../../../../workflows/mutate-vendor-application";
import type { ReviewApplicationBody, ReviewApplicationResponse } from "../../../../../lib/vendor-onboarding/schemas";
export async function POST(req: AuthenticatedMedusaRequest<ReviewApplicationBody>, res: MedusaResponse<ReviewApplicationResponse>) {
  return onboardingHttp(res, async () => {
    const { result } = await mutateVendorApplicationWorkflow(req.scope).run({ input: { operation: "review", application_id: req.params.id, reviewer_id: req.auth_context.actor_id, body: req.validatedBody } });
    return res.status(result.processing ? 202 : 200).json(await adminApplicationResponse(req.scope, req.auth_context.actor_id, req.params.id));
  });
}
