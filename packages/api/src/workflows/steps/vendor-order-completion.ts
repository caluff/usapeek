import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { validateSellerOrder } from "@mercurjs/core/api/vendor/orders/helpers";
import { readVendorOrderCompletion } from "../../lib/vendor-orders/completion";

export type VendorOrderCompletionInput = {
  order_id: string;
  seller_id: string;
};
export const authorizeVendorOrderStep = createStep(
  "authorize-vendor-order",
  async (input: VendorOrderCompletionInput, { container }) => {
    await validateSellerOrder(container, input.seller_id, input.order_id);
    return new StepResponse(input);
  },
);
export const readVendorOrderCompletionStep = createStep(
  "read-vendor-order-completion",
  async (
    input: VendorOrderCompletionInput & { require_ready?: boolean },
    { container },
  ) => {
    const eligibility = await readVendorOrderCompletion(
      container,
      input.seller_id,
      input.order_id,
    );
    if (input.require_ready && !eligibility.can_complete)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Entrega todos los artículos con envío y prepara los de recogida antes de completar el pedido.",
      );
    return new StepResponse({ ...input, ...eligibility });
  },
);

export const authorizeVendorOrderDeliveryStep = createStep(
  "authorize-vendor-order-delivery",
  async (
    input: VendorOrderCompletionInput & { fulfillment_id: string },
    { container },
  ) => {
    const eligibility = await readVendorOrderCompletion(
      container,
      input.seller_id,
      input.order_id,
    );
    const {
      data: [order],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph(
      {
        entity: "order",
        fields: [
          "id",
          "status",
          "fulfillments.id",
          "fulfillments.canceled_at",
          "fulfillments.shipped_at",
          "fulfillments.delivered_at",
        ],
        filters: { id: input.order_id },
      },
      { cache: { enable: false } },
    );
    const fulfillment = order?.fulfillments?.find(
      (entry) => entry?.id === input.fulfillment_id,
    );
    if (
      !fulfillment ||
      fulfillment.canceled_at ||
      eligibility.pickup_fulfillment_ids.includes(input.fulfillment_id) ||
      !fulfillment.shipped_at ||
      !["pending", "completed"].includes(order.status)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Solo puedes registrar la entrega de un envío activo de este pedido.",
      );
    }
    if (order.status === "completed" && !fulfillment.delivered_at)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El pedido ya está completado.",
      );
    return new StepResponse({
      ...input,
      should_deliver: !fulfillment.delivered_at,
    });
  },
);
