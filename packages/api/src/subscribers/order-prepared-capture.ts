import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { capturePreparedPurchaseWorkflow } from "../workflows/capture-prepared-purchase";

export default async function orderPreparedCapture({
  event: { data },
  container,
}: SubscriberArgs<{ id?: string; order_id?: string }>) {
  const orderId = z
    .string()
    .startsWith("order_")
    .parse(data.order_id ?? data.id);
  await capturePreparedPurchaseWorkflow(container).run({
    input: { order_id: orderId },
  });
}

export const config: SubscriberConfig = {
  event: [
    OrderWorkflowEvents.FULFILLMENT_CREATED,
    OrderWorkflowEvents.CANCELED,
  ],
  context: { subscriberId: "usapeek-order-prepared-capture" },
};
