import type { MedusaContainer } from "@medusajs/framework/types";
import {
  FulfillmentWorkflowEvents,
  OrderWorkflowEvents,
  ProductWorkflowEvents as MedusaProductWorkflowEvents,
} from "@medusajs/framework/utils";
import { SellerWorkflowEvents } from "@mercurjs/core/workflows/events";
import { ProductWorkflowEvents } from "@mercurjs/core/workflows/product/events";
import { ProductChangeWorkflowEvents } from "@mercurjs/core/workflows/product-edit/events";
import { z } from "@medusajs/framework/zod";
import { ORDER_NOTIFICATIONS_MODULE } from "../../modules/order-notifications";
import type OrderNotificationsService from "../../modules/order-notifications/service";
import type { AdminNotificationEvent } from "./contracts";

export const APPLICATION_NOTIFICATION_EVENT = "vendor-application.changed";
const topicEvents: Record<string, AdminNotificationEvent> = {
  [APPLICATION_NOTIFICATION_EVENT]: "applications-changed",
};
for (const event of [
  ...Object.values(ProductWorkflowEvents),
  ...Object.values(ProductChangeWorkflowEvents),
  MedusaProductWorkflowEvents.UPDATED,
  MedusaProductWorkflowEvents.DELETED,
]) topicEvents[event] = "catalog-changed";
for (const event of Object.values(SellerWorkflowEvents))
  topicEvents[event] = "stores-changed";
for (const event of [
  "order_group.created",
  OrderWorkflowEvents.PLACED,
  OrderWorkflowEvents.UPDATED,
  OrderWorkflowEvents.COMPLETED,
  OrderWorkflowEvents.CANCELED,
  OrderWorkflowEvents.FULFILLMENT_CREATED,
  OrderWorkflowEvents.FULFILLMENT_CANCELED,
  FulfillmentWorkflowEvents.SHIPMENT_CREATED,
  FulfillmentWorkflowEvents.DELIVERY_CREATED,
]) topicEvents[event] = "orders-changed";

export const ADMIN_NOTIFICATION_EVENTS = Object.keys(topicEvents);
const eventId = z.string().min(1).max(128);
const eventDataSchema = z.union([
  z.object({ id: z.union([eventId, z.array(eventId).min(1).max(100)]) }),
  z.array(z.object({ id: eventId })).min(1).max(100),
]);

export function adminNotificationEventTopic(name: string, data: unknown) {
  if (!Object.prototype.hasOwnProperty.call(topicEvents, name) || !eventDataSchema.safeParse(data).success)
    return null;
  return topicEvents[name];
}

export async function publishAdminNotification(
  container: MedusaContainer,
  name: string,
  data: unknown,
) {
  const topic = adminNotificationEventTopic(name, data);
  if (!topic) return;
  await container
    .resolve<OrderNotificationsService>(ORDER_NOTIFICATIONS_MODULE)
    .publishAdminChanged(topic);
}
