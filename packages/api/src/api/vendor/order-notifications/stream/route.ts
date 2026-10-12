import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { openOrderNotificationStream } from "../../../../lib/vendor-orders/notification-stream";
import { ORDER_NOTIFICATIONS_MODULE } from "../../../../modules/order-notifications";
import type OrderNotificationsService from "../../../../modules/order-notifications/service";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  return openOrderNotificationStream(
    req,
    res,
    req.scope.resolve<OrderNotificationsService>(ORDER_NOTIFICATIONS_MODULE),
  );
}
