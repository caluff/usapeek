import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, OrderWorkflowEvents } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { getAuthEmailConfiguration } from "../lib/auth-email";
import { deliverEmailNotification } from "../lib/deliver-email-notification";
import { buildOrderTrackingUrl } from "../lib/order-tracking/access";

export type OrderConfirmationNotificationInput = { id: string; no_notification?: boolean };

export async function sendOrderConfirmationNotification(
  container: MedusaContainer,
  input: OrderConfirmationNotificationInput,
) {
  if (input.no_notification) return { sent: false };
  const configuration = getAuthEmailConfiguration();
  if (!configuration.enabled) return { sent: false };

  const id = z.string().regex(/^order_[a-zA-Z0-9]+$/).parse(input.id);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "email", "display_id", "custom_display_id", "status", "created_at"],
    filters: { id },
  }, { cache: { enable: false } });
  if (!order?.email || order.status === "canceled" || order.status === "draft") {
    return { sent: false };
  }

  const notification = await deliverEmailNotification(container, {
    to: order.email,
    from: configuration.from,
    channel: "email",
    template: "order-confirmed",
    trigger_type: OrderWorkflowEvents.PLACED,
    idempotency_key: `order-confirmed:${order.id}`,
    data: {
      order_number: order.custom_display_id?.trim() || `PED-${String(order.display_id).padStart(9, "0")}`,
      // Anchor expiration to the event, so retries retain the same signed URL.
      order_url: buildOrderTrackingUrl({ id: order.id, email: order.email }, process.env, order.created_at),
    },
  });
  if (notification.status !== "success") {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Order confirmation delivery was not confirmed");
  }
  return { sent: true };
}

const sendOrderConfirmationNotificationStep = createStep(
  "send-order-confirmation-notification",
  async (input: OrderConfirmationNotificationInput, { container }) => (
    new StepResponse(await sendOrderConfirmationNotification(container, input))
  ),
);

export const sendOrderConfirmationNotificationWorkflow = createWorkflow(
  "send-order-confirmation-notification",
  function (input: OrderConfirmationNotificationInput) {
    return new WorkflowResponse(sendOrderConfirmationNotificationStep(input));
  },
);
