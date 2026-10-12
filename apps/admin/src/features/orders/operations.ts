import type Medusa from "@medusajs/js-sdk";
import { retrieveOrder } from "./data";
import {
  canComplete,
  canDeliver,
  canCancelFulfillment,
  isOrderId,
  OrderValidationError,
} from "./helpers";

export async function operateOrder(sdk: Medusa, form: FormData) {
  const id = form.get("order_id");
  const action = form.get("operation");
  if (typeof id !== "string" || !isOrderId(id))
    throw new OrderValidationError("Pedido inválido.");
  if (form.get("confirmed") !== "yes")
    throw new OrderValidationError("Confirma la operación antes de continuar.");
  if (
    action !== "complete" &&
    action !== "deliver" &&
    action !== "cancel_fulfillment"
  )
    throw new OrderValidationError("Operación no disponible.");
  // Re-read immediately before mutation; never trust the rendered capabilities.
  const order = await retrieveOrder(sdk, id);
  if (action === "complete") {
    if (!canComplete(order))
      throw new OrderValidationError(
        "Solo se pueden completar pedidos pendientes con todos sus artículos entregados. Actualiza el pedido.",
      );
    await sdk.admin.order.complete(id, {});
  } else {
    const fulfillmentId = form.get("fulfillment_id");
    if (
      typeof fulfillmentId !== "string" ||
      !/^ful_[a-zA-Z0-9]+$/.test(fulfillmentId) ||
      !(action === "deliver"
        ? canDeliver(order, fulfillmentId)
        : canCancelFulfillment(order, fulfillmentId))
    )
      throw new OrderValidationError(
        action === "deliver"
          ? "El envío ya no está pendiente de entrega en este pedido. Actualiza el pedido."
          : "La preparación ya no se puede cancelar. Actualiza el pedido.",
      );
    if (action === "deliver")
      await sdk.admin.order.markAsDelivered(id, fulfillmentId, {});
    else await sdk.admin.order.cancelFulfillment(id, fulfillmentId, {});
  }
  return id;
}
