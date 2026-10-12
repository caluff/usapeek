import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { FulfillmentWorkflowEvents } from "@medusajs/framework/utils";
import { sendShipmentNotificationWorkflow, type ShipmentNotificationInput } from "../workflows/shipment-notification";

export default async function orderShippedHandler({ event: { data }, container }: SubscriberArgs<ShipmentNotificationInput>) {
  await sendShipmentNotificationWorkflow(container).run({ input: data });
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.SHIPMENT_CREATED,
};
