import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { openSellerNotificationStream } from "../../../../../lib/vendor-orders/notification-stream";
import { ORDER_NOTIFICATIONS_MODULE } from "../../../../../modules/order-notifications";
import type OrderNotificationsService from "../../../../../modules/order-notifications/service";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const notifications = req.scope.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  return openSellerNotificationStream(
    req,
    res,
    {
      subscribe: (sellerId, changed, closed) =>
        notifications.subscribeSettlements(sellerId, changed, closed),
    },
    { eventName: "settlements-changed" },
  );
}
