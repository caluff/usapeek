import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { applicantFromRequest, onboardingHttp } from "../../../../../lib/vendor-onboarding/http";
import { readVendorApplicationNotificationsWorkflow } from "../../../../../workflows/vendor-application-notifications";
import { unreadCount } from "../../../../../lib/vendor-onboarding/views";
import type { ReadNotificationsBody, ReadNotificationsResponse } from "../../../../../lib/vendor-onboarding/schemas";
export async function POST(req: AuthenticatedMedusaRequest<ReadNotificationsBody>, res: MedusaResponse<ReadNotificationsResponse>) {
  return onboardingHttp(res, async () => {
    const applicant = applicantFromRequest(req);
    await readVendorApplicationNotificationsWorkflow(req.scope).run({ input: { applicant, notification_ids: req.validatedBody.notification_ids } });
    return res.json({ unread_count: await unreadCount(req.scope, applicant.customer_id) });
  });
}
