import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { applicantFromRequest, onboardingHttp } from "../../../../lib/vendor-onboarding/http";
import { notificationsResponse } from "../../../../lib/vendor-onboarding/views";
import { PaginationSchema, type ApplicationNotificationsResponse } from "../../../../lib/vendor-onboarding/schemas";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<ApplicationNotificationsResponse>) {
  return onboardingHttp(res, async () => res.json(await notificationsResponse(req.scope, applicantFromRequest(req), PaginationSchema.parse(req.validatedQuery))));
}
