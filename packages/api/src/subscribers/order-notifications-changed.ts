import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  FulfillmentWorkflowEvents,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { invalidateOrderNotificationsWorkflow } from "../workflows/invalidate-order-notifications";

export default async function orderNotificationsChanged({
  event: { data, name },
  container,
}: SubscriberArgs<{ id?: string; order_id?: string }>) {
  await invalidateOrderNotificationsWorkflow(container).run({
    input: orderNotificationEventInput(name, data),
  });
}

export function orderNotificationEventInput(
  name: string,
  data: { id?: string; order_id?: string },
) {
  const input =
    name === "order_group.created"
      ? { group_id: z.string().min(1).parse(data.id) }
      : name === FulfillmentWorkflowEvents.SHIPMENT_CREATED ||
          name === FulfillmentWorkflowEvents.DELIVERY_CREATED
        ? { fulfillment_id: z.string().startsWith("ful_").parse(data.id) }
        : {
            order_ids: [
              z
                .string()
                .startsWith("order_")
                .parse(data.order_id ?? data.id),
            ],
          };
  return input;
}

export const config: SubscriberConfig = {
  event: [
    "order_group.created",
    "order.customer_return_requested",
    OrderWorkflowEvents.PLACED,
    OrderWorkflowEvents.UPDATED,
    OrderWorkflowEvents.COMPLETED,
    OrderWorkflowEvents.CANCELED,
    OrderWorkflowEvents.FULFILLMENT_CREATED,
    OrderWorkflowEvents.FULFILLMENT_CANCELED,
    OrderWorkflowEvents.RETURN_REQUESTED,
    OrderWorkflowEvents.RETURN_RECEIVED,
    FulfillmentWorkflowEvents.SHIPMENT_CREATED,
    FulfillmentWorkflowEvents.DELIVERY_CREATED,
  ],
};
