import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import type { VendorCreateFulfillmentType } from "@mercurjs/core/api/vendor/orders/validators";
import type { CreateOrderFulfillmentWorkflowInput } from "@mercurjs/core/workflows/order/workflows/create-order-fulfillment";
import { assertSellerWarehouseLocations } from "../vendor-warehouse/access";
import { readVendorOrderCompletion } from "./completion";

export type VendorOrderPreparationInput = VendorCreateFulfillmentType & {
  order_id: string;
  seller_id: string;
};

export async function prepareVendorOrderFulfillment(
  container: MedusaContainer,
  input: VendorOrderPreparationInput,
): Promise<CreateOrderFulfillmentWorkflowInput> {
  const eligibility = await readVendorOrderCompletion(
    container,
    input.seller_id,
    input.order_id,
  );
  const itemIds = input.items.map((item) => item.id);
  if (
    !itemIds.length ||
    new Set(itemIds).size !== itemIds.length ||
    input.items.some(
      (item) => !Number.isSafeInteger(item.quantity) || item.quantity <= 0,
    )
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Selecciona artículos distintos con cantidades positivas para prepararlos.",
    );
  const groups = eligibility.preparation_groups.filter((group) =>
    itemIds.every((id) => group.item_ids.includes(id)),
  );
  const group = groups.length === 1 ? groups[0] : undefined;
  if (
    !group ||
    (input.shipping_option_id !== undefined &&
      input.shipping_option_id !== group.shipping_option_id) ||
    input.requires_shipping !== (group.shipping_option_id !== null)
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Prepara juntos solo los artículos de la misma opción de entrega del pedido.",
    );
  await assertSellerWarehouseLocations(container, input.seller_id, [
    input.location_id,
  ]);
  const {
    seller_id,
    shipping_option_id: _submittedOption,
    ...fulfillment
  } = input;
  // Mercur otherwise uses the first shipping method, including for mixed orders.
  return {
    ...fulfillment,
    created_by: seller_id,
    ...(group.shipping_option_id
      ? { shipping_option_id: group.shipping_option_id }
      : {}),
  };
}
