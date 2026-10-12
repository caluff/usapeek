import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";

const BATCH_SIZE = 128;

export async function hasPendingSellerOrders(
  container: MedusaContainer,
  sellerId: string,
): Promise<boolean> {
  if (!sellerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Order seller scope is required.",
    );
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  let beforeOrderId: string | undefined;

  while (true) {
    const { data: sellerLinks } = await query.graph(
      {
        entity: "order_seller",
        fields: ["order_id"],
        filters: {
          seller_id: sellerId,
          ...(beforeOrderId ? { order_id: { $lt: beforeOrderId } } : {}),
        },
        // Take-only pagination uses native list instead of listAndCount. Keyset
        // batches keep memory bounded and stop as soon as one pending order exists.
        pagination: { take: BATCH_SIZE, order: { order_id: "DESC" } },
      },
      { cache: { enable: false } },
    );

    if (!sellerLinks.length) return false;

    const orderIds = sellerLinks.map((link) => link.order_id);
    const { data: returns } = await query.graph(
      {
        entity: "return",
        fields: ["id"],
        filters: {
          order_id: orderIds,
          canceled_at: null,
          status: ["open", "requested", "partially_received"],
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    );
    if (returns.length) return true;
    const { data: orders } = await query.graph(
      {
        entity: "order",
        fields: ["id"],
        filters: { id: orderIds, status: "pending", is_draft_order: false },
      },
      { cache: { enable: false } },
    );

    if (orders.length) {
      const pendingIds = orders.map((order) => order.id);
      const { data: fulfillmentLinks } = await query.graph(
        {
          entity: "order_fulfillment",
          fields: ["order_id", "fulfillment_id"],
          filters: { order_id: pendingIds },
        },
        { cache: { enable: false } },
      );
      const owners = new Map(
        fulfillmentLinks.map((link) => [link.fulfillment_id, link.order_id]),
      );
      const linkedOrders = new Set(
        fulfillmentLinks.map((link) => link.order_id),
      );
      if (pendingIds.some((id) => !linkedOrders.has(id))) return true;

      const advancedOrders = new Set<string>();
      const fulfillmentIds = [...owners.keys()];
      for (let start = 0; start < fulfillmentIds.length; start += BATCH_SIZE) {
        const { data: advanced } = await query.graph(
          {
            entity: "fulfillment",
            fields: ["id"],
            filters: {
              id: fulfillmentIds.slice(start, start + BATCH_SIZE),
              canceled_at: null,
              $or: [
                { packed_at: { $ne: null } },
                { shipped_at: { $ne: null } },
                { delivered_at: { $ne: null } },
              ],
            },
          },
          { cache: { enable: false } },
        );
        for (const fulfillment of advanced) {
          advancedOrders.add(owners.get(fulfillment.id)!);
        }
      }
      if (pendingIds.some((id) => !advancedOrders.has(id))) return true;
    }

    if (sellerLinks.length < BATCH_SIZE) return false;
    beforeOrderId = orderIds[orderIds.length - 1];
  }
}
