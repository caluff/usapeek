import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { AdminNotificationsQuery } from "./middlewares";
import { readAdminNotifications } from "../../../lib/admin-notifications/read";
import type { AdminNotificationsResponse } from "../../../lib/admin-notifications/contracts";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, AdminNotificationsQuery>,
  res: MedusaResponse<AdminNotificationsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readAdminNotifications(req, req.validatedQuery.fresh === "1"));
}
