import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { getAuthEmailConfiguration } from "../lib/auth-email";
import { deliverEmailNotification } from "../lib/deliver-email-notification";
import { buildOrderTrackingUrl } from "../lib/order-tracking/access";

export type ShipmentNotificationInput = { id: string; no_notification?: boolean };

export async function sendShipmentNotification(
  container: MedusaContainer,
  input: ShipmentNotificationInput,
) {
  if (input.no_notification) return { sent: false };
  const configuration = getAuthEmailConfiguration();
  if (!configuration.enabled) return { sent: false };
  const id = z.string().regex(/^ful_[a-zA-Z0-9]+$/).parse(input.id);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [fulfillment] } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id", "shipped_at", "canceled_at", "requires_shipping",
      "labels.tracking_number",
      "order.id", "order.email", "order.display_id", "order.custom_display_id", "order.status",
    ],
    filters: { id },
  }, { cache: { enable: false } });
  const order = fulfillment?.order;
  if (!fulfillment?.shipped_at || fulfillment.canceled_at || !fulfillment.requires_shipping
    || !order?.email || order.status === "canceled") {
    return { sent: false };
  }
  const notification = await deliverEmailNotification(container, {
    to: order.email,
    from: configuration.from,
    channel: "email",
    template: "order-shipped",
    trigger_type: "shipment.created",
    // Each package has its own event; retries must not send a second email.
    idempotency_key: `shipment-created:${fulfillment.id}`,
    data: {
      order_number: order.custom_display_id?.trim() || `PED-${String(order.display_id).padStart(9, "0")}`,
      order_url: buildOrderTrackingUrl({ id: order.id, email: order.email }, process.env, fulfillment.shipped_at),
      tracking_numbers: fulfillment.labels?.map((label) => label.tracking_number).filter(Boolean) ?? [],
    },
  });
  if (notification.status !== "success") {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Shipment notification delivery was not confirmed");
  }
  return { sent: true };
}

const sendShipmentNotificationStep = createStep(
  "send-shipment-notification",
  async (input: ShipmentNotificationInput, { container }) => (
    new StepResponse(await sendShipmentNotification(container, input))
  ),
);

export const sendShipmentNotificationWorkflow = createWorkflow(
  "send-shipment-notification",
  function (input: ShipmentNotificationInput) {
    return new WorkflowResponse(sendShipmentNotificationStep(input));
  },
);
