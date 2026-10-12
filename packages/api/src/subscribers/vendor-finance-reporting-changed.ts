import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { invalidateVendorFinanceReportingWorkflow } from "../workflows/invalidate-vendor-finance-reporting";

export default async function vendorFinanceReportingChanged({
  event: { data, name },
  container,
}: SubscriberArgs<{ id?: string; order_id?: string }>) {
  const input =
    name === "order_group.created"
      ? { group_id: z.string().min(1).parse(data.id) }
      : {
          order_ids: [
            z
              .string()
              .startsWith("order_")
              .parse(data.order_id ?? data.id),
          ],
        };
  await invalidateVendorFinanceReportingWorkflow(container).run({ input });
}

export const config: SubscriberConfig = {
  event: [
    "order_group.created",
    OrderWorkflowEvents.PLACED,
    OrderWorkflowEvents.COMPLETED,
    OrderWorkflowEvents.UPDATED,
    OrderWorkflowEvents.CANCELED,
    OrderWorkflowEvents.FULFILLMENT_CREATED,
    OrderWorkflowEvents.FULFILLMENT_CANCELED,
    OrderWorkflowEvents.RETURN_RECEIVED,
    OrderWorkflowEvents.RETURN_REQUESTED,
  ],
};
