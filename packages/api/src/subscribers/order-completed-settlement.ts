import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { automaticReleaseAvailable } from "../lib/order-finance/release-settings";
import { recordOrderCompletionsWorkflow } from "../workflows/record-order-completions";

export default async function orderCompletedSettlement({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!automaticReleaseAvailable()) return;
  const { id } = z.object({ id: z.string().startsWith("order_") }).parse(data);
  await recordOrderCompletionsWorkflow(container).run({
    input: { order_ids: [id] },
  });
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.COMPLETED,
};
