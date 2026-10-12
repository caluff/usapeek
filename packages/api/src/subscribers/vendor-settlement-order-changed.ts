import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { invalidateVendorSettlementsWorkflow } from "../workflows/invalidate-vendor-settlements";

export default async function vendorSettlementOrderChanged({
  event: { data },
  container,
}: SubscriberArgs<{ id?: string; order_id?: string }>) {
  const id = z
    .string()
    .startsWith("order_")
    .parse(data.order_id ?? data.id);
  await invalidateVendorSettlementsWorkflow(container).run({
    input: { order_ids: [id] },
  });
}

export const config: SubscriberConfig = {
  event: [
    "order.customer_return_requested",
    OrderWorkflowEvents.COMPLETED,
    OrderWorkflowEvents.UPDATED,
    OrderWorkflowEvents.CANCELED,
    OrderWorkflowEvents.FULFILLMENT_CREATED,
    OrderWorkflowEvents.FULFILLMENT_CANCELED,
    OrderWorkflowEvents.RETURN_RECEIVED,
    OrderWorkflowEvents.RETURN_REQUESTED,
  ],
};
