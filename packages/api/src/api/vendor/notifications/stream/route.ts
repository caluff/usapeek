import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { openSellerMultiplexNotificationStream } from "../../../../lib/vendor-orders/notification-stream";
import { sellerNotificationTopics } from "../../../../lib/vendor-orders/notification-topics";
import { ORDER_NOTIFICATIONS_MODULE } from "../../../../modules/order-notifications";
import type OrderNotificationsService from "../../../../modules/order-notifications/service";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const topics = await sellerNotificationTopics(req);
  const notifications = req.scope.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  const subscribers = {
    "orders-changed": notifications.subscribe.bind(notifications),
    "settlements-changed": notifications.subscribeSettlements.bind(notifications),
    "finance-reporting-changed":
      notifications.subscribeReporting.bind(notifications),
    "catalog-changed": notifications.subscribeCatalog.bind(notifications),
  };
  return openSellerMultiplexNotificationStream(
    req,
    res,
    topics.map((eventName) => ({ eventName, subscribe: subscribers[eventName] })),
  );
}
