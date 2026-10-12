import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { onboardingHttp } from "../../../../lib/vendor-onboarding/http";
import { adminApplicationResponse } from "../../../../lib/vendor-onboarding/views";
import type { AdminApplicationResponse } from "../../../../lib/vendor-onboarding/schemas";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<AdminApplicationResponse>) {
  return onboardingHttp(res, async () => res.json(await adminApplicationResponse(req.scope, req.auth_context.actor_id, req.params.id)));
}
