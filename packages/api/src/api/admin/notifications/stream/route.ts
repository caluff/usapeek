import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { adminNotificationAccess } from "../../../../lib/admin-notifications/access";
import { openNotificationStream } from "../../../../lib/vendor-orders/notification-stream";
import { ORDER_NOTIFICATIONS_MODULE } from "../../../../modules/order-notifications";
import type OrderNotificationsService from "../../../../modules/order-notifications/service";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const expectedAccount = req.get("x-admin-account-id");
  if (expectedAccount && expectedAccount !== req.auth_context.actor_id)
    return res.status(409).end();
  const { topics, applications } = await adminNotificationAccess(req);
  if (!topics.length) {
    if (applications === "unavailable") return res.status(503).end();
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "No notification topics are permitted.");
  }
  const notifications = req.scope.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  return openNotificationStream(
    req,
    res,
    topics.map((eventName) => ({
      eventName,
      subscribe: (changed, closed) =>
        notifications.subscribeAdmin(eventName, changed, closed),
    })),
  );
}
