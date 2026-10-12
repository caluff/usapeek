import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { hasPendingSellerOrders } from "../../../lib/vendor-orders/pending";
import { ORDER_NOTIFICATIONS_MODULE } from "../../../modules/order-notifications";
import type OrderNotificationsService from "../../../modules/order-notifications/service";
import type { VendorOrderNotificationsResponse } from "./contracts";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<VendorOrderNotificationsResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const sellerId = req.seller_context?.seller_id ?? "";
  const notifications = req.scope.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  res.json({
    has_pending_orders: await notifications.snapshot(
      sellerId,
      () => hasPendingSellerOrders(req.scope, sellerId),
      req.validatedQuery.fresh === "1",
    ),
  });
}
