import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { validateSellerOrder } from "@mercurjs/core/api/vendor/orders/helpers";
import type { VendorOrderCompletionResponse } from "../../api/vendor/order-notifications/contracts";

const quantity = z.coerce.number().finite().nonnegative();
const timestamp = z.union([z.string().min(1), z.date()]).nullable();
const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  items: z.array(
    z.object({
      id: z.string().min(1),
      quantity: quantity.positive().optional(),
      requires_shipping: z.boolean(),
      offer: z.object({ shipping_profile_id: z.string().nullish() }).nullish(),
      detail: z.object({
        quantity: quantity.positive().optional(),
        fulfilled_quantity: quantity,
        delivered_quantity: quantity,
      }),
    }),
  ),
  shipping_methods: z
    .array(z.object({ shipping_option_id: z.string().nullish() }))
    .nullish(),
  fulfillments: z.array(
    z.object({
      id: z.string().min(1),
      canceled_at: timestamp,
      delivered_at: timestamp,
      shipping_option_id: z.string().nullable(),
      items: z.array(z.object({ line_item_id: z.string().min(1) })),
    }),
  ),
});
const shippingOptionSchema = z.object({
  id: z.string(),
  shipping_profile_id: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  service_zone: z
    .object({ fulfillment_set: z.object({ type: z.string() }).nullish() })
    .nullish(),
});

function orderDeliveryEligibility(
  value: unknown,
  shippingOptions: unknown,
): Omit<VendorOrderCompletionResponse, "can_complete"> & {
  status: string | null;
  is_ready: boolean;
} {
  const order = orderSchema.safeParse(value);
  const options = z.array(shippingOptionSchema).safeParse(shippingOptions);
  if (!order.success || !options.success)
    return {
      status: null,
      is_ready: false,
      pickup_fulfillment_ids: [],
      preparation_groups: [],
    };
  const pickupOptions = new Set(
    options.data.flatMap((option) =>
      option.metadata?.marketplace_v2_pickup === true ||
      option.service_zone?.fulfillment_set?.type === "pickup"
        ? [option.id]
        : [],
    ),
  );
  const active = order.data.fulfillments.filter(
    (fulfillment) => !fulfillment.canceled_at,
  );
  const optionsById = new Map(
    options.data.map((option) => [option.id, option]),
  );
  const selectedIds = new Set(
    (order.data.shipping_methods ?? []).flatMap((method) =>
      method.shipping_option_id ? [method.shipping_option_id] : [],
    ),
  );
  const selectedOptions = [...selectedIds].flatMap((id) =>
    optionsById.has(id) ? [optionsById.get(id)!] : [],
  );
  const preparationGroups = new Map<
    string | null,
    VendorOrderCompletionResponse["preparation_groups"][number]
  >();
  for (const item of order.data.items) {
    const profileId = item.offer?.shipping_profile_id;
    const matches = item.requires_shipping
      ? selectedOptions.filter(
          (option) => !profileId || option.shipping_profile_id === profileId,
        )
      : [];
    if (
      item.requires_shipping &&
      (matches.length !== 1 || selectedIds.size !== selectedOptions.length)
    )
      continue;
    const optionId = item.requires_shipping ? matches[0].id : null;
    const group = preparationGroups.get(optionId) ?? {
      shipping_option_id: optionId,
      is_pickup: optionId !== null && pickupOptions.has(optionId),
      item_ids: [],
    };
    group.item_ids.push(item.id);
    preparationGroups.set(optionId, group);
  }
  const pickupIds = active.flatMap((fulfillment) => {
    const option = fulfillment.shipping_option_id
      ? optionsById.get(fulfillment.shipping_option_id)
      : undefined;
    if (!option || !pickupOptions.has(option.id) || !fulfillment.items.length)
      return [];
    const allPickup = fulfillment.items.every((entry) => {
      const item = order.data.items.find(
        (item) => item.id === entry.line_item_id,
      );
      if (!item) return false;
      if (!item.requires_shipping) return true;
      const profileId = item.offer?.shipping_profile_id;
      if (profileId && option.shipping_profile_id !== profileId) return false;
      if (!selectedIds.size) return true;
      if (selectedIds.size !== selectedOptions.length) return false;
      const matches = selectedOptions.filter(
        (selected) => !profileId || selected.shipping_profile_id === profileId,
      );
      return (
        matches.length > 0 &&
        matches.every((selected) => pickupOptions.has(selected.id)) &&
        (!profileId || matches.some((selected) => selected.id === option.id))
      );
    });
    return allPickup ? [fulfillment.id] : [];
  });
  const pickups = new Set(pickupIds);
  const ready =
    order.data.items.length > 0 &&
    order.data.items.every((item) => {
      // Graph reads expose the versioned quantity through the detail relation;
      // the native order detail endpoint also normalizes it onto the item.
      const orderedQuantity = item.quantity ?? item.detail.quantity;
      if (
        orderedQuantity === undefined ||
        item.detail.fulfilled_quantity < orderedQuantity
      )
        return false;
      if (
        !item.requires_shipping ||
        item.detail.delivered_quantity >= orderedQuantity
      )
        return true;
      const outstanding = active.filter(
        (fulfillment) =>
          !fulfillment.delivered_at &&
          fulfillment.items.some((entry) => entry.line_item_id === item.id),
      );
      return (
        outstanding.length > 0 &&
        outstanding.every((fulfillment) => pickups.has(fulfillment.id))
      );
    });
  return {
    status: order.data.status,
    is_ready: ready,
    pickup_fulfillment_ids: pickupIds,
    preparation_groups: [...preparationGroups.values()],
  };
}

export function orderCompletionEligibility(
  value: unknown,
  shippingOptions: unknown,
): VendorOrderCompletionResponse {
  const { status, is_ready, ...fulfillment } = orderDeliveryEligibility(
    value,
    shippingOptions,
  );
  return { can_complete: status === "pending" && is_ready, ...fulfillment };
}

export function completedOrderDeliveryReady(
  value: unknown,
  shippingOptions: unknown,
): boolean {
  const eligibility = orderDeliveryEligibility(value, shippingOptions);
  return eligibility.status === "completed" && eligibility.is_ready;
}

async function readOrderDelivery(
  container: MedusaContainer,
  sellerId: string,
  orderId: string,
) {
  await validateSellerOrder(container, sellerId, orderId);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph(
    {
      entity: "order",
      fields: [
        "id",
        "status",
        "items.id",
        "items.quantity",
        "items.requires_shipping",
        "items.offer.shipping_profile_id",
        "items.detail.quantity",
        "items.detail.fulfilled_quantity",
        "items.detail.delivered_quantity",
        "fulfillments.id",
        "fulfillments.canceled_at",
        "fulfillments.delivered_at",
        "fulfillments.shipping_option_id",
        "fulfillments.items.line_item_id",
        "shipping_methods.shipping_option_id",
      ],
      filters: { id: orderId },
    },
    { cache: { enable: false } },
  );
  if (!order)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido no encontrado.");
  const optionIds = [
    ...new Set([
      ...(order.fulfillments ?? []).flatMap((fulfillment) =>
        fulfillment?.shipping_option_id ? [fulfillment.shipping_option_id] : [],
      ),
      ...(order.shipping_methods ?? []).flatMap((method) =>
        method?.shipping_option_id ? [method.shipping_option_id] : [],
      ),
    ]),
  ];
  const options = optionIds.length
    ? (
        await query.graph(
          {
            entity: "shipping_option",
            fields: [
              "id",
              "shipping_profile_id",
              "metadata",
              "service_zone.fulfillment_set.type",
            ],
            filters: { id: optionIds },
          },
          { cache: { enable: false } },
        )
      ).data
    : [];
  return { order, options };
}

export async function readVendorOrderCompletion(
  container: MedusaContainer,
  sellerId: string,
  orderId: string,
) {
  const { order, options } = await readOrderDelivery(
    container,
    sellerId,
    orderId,
  );
  return orderCompletionEligibility(order, options);
}

export async function readCompletedOrderDeliveryReady(
  container: MedusaContainer,
  sellerId: string,
  orderId: string,
) {
  const { order, options } = await readOrderDelivery(
    container,
    sellerId,
    orderId,
  );
  return completedOrderDeliveryReady(order, options);
}
