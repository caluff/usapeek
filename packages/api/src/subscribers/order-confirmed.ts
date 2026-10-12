import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import {
  sendOrderConfirmationNotificationWorkflow,
  type OrderConfirmationNotificationInput,
} from "../workflows/order-confirmation-notification";

export default async function orderConfirmedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderConfirmationNotificationInput>) {
  await sendOrderConfirmationNotificationWorkflow(container).run({ input: data });
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
};
