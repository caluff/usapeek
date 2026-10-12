import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { onboardingHttp } from "../../../lib/vendor-onboarding/http";
import { adminApplicationList } from "../../../lib/vendor-onboarding/views";
import { AdminApplicationQuerySchema, type AdminApplicationListResponse } from "../../../lib/vendor-onboarding/schemas";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<AdminApplicationListResponse>) {
  return onboardingHttp(res, async () => res.json(await adminApplicationList(req.scope, req.auth_context.actor_id, AdminApplicationQuerySchema.parse(req.validatedQuery))));
}
