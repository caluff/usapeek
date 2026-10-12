import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ORDER_NOTIFICATIONS_MODULE } from "../../modules/order-notifications";
import type OrderNotificationsService from "../../modules/order-notifications/service";

export type InvalidateOrderNotificationsInput = {
  order_ids?: string[];
  group_id?: string;
  fulfillment_id?: string;
};

// Called by the invalidation workflow; resolves ownership from native links,
// never from event-supplied seller identifiers.
export async function invalidateOrderNotificationScope(
  container: MedusaContainer,
  input: InvalidateOrderNotificationsInput,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const orderIds = new Set(input.order_ids ?? []);
  if (input.group_id) {
    const { data: groups } = await query.graph(
      {
        entity: "order_group",
        fields: ["orders.id"],
        filters: { id: input.group_id },
      },
      { cache: { enable: false } },
    );
    for (const group of groups)
      for (const order of group.orders ?? []) if (order) orderIds.add(order.id);
  }
  if (input.fulfillment_id) {
    const { data: links } = await query.graph(
      {
        entity: "order_fulfillment",
        fields: ["order_id"],
        filters: { fulfillment_id: input.fulfillment_id },
      },
      { cache: { enable: false } },
    );
    for (const link of links) orderIds.add(link.order_id);
  }
  if (!orderIds.size) return;
  const { data: links } = await query.graph(
    {
      entity: "order_seller",
      fields: ["seller_id"],
      filters: { order_id: [...orderIds] },
    },
    { cache: { enable: false } },
  );
  const notifications = container.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  await Promise.all(
    [...new Set(links.map((link) => link.seller_id))].map((sellerId) =>
      notifications.invalidate(sellerId),
    ),
  );
}
