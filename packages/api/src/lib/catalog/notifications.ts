import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ProductChangeActionType } from "@mercurjs/types";
import { ProductChangeWorkflowEvents } from "@mercurjs/core/workflows/product-edit/events";
import { ProductWorkflowEvents } from "@mercurjs/core/workflows/product/events";
import { z } from "@medusajs/framework/zod";
import { ORDER_NOTIFICATIONS_MODULE } from "../../modules/order-notifications";
import type OrderNotificationsService from "../../modules/order-notifications/service";

export const CATALOG_NOTIFICATION_EVENTS = [
  ...Object.values(ProductChangeWorkflowEvents),
  ProductWorkflowEvents.PUBLISHED,
  ProductWorkflowEvents.REJECTED,
  ProductWorkflowEvents.CHANGE_REQUESTED,
];

const catalogEvents = new Set<string>(CATALOG_NOTIFICATION_EVENTS);
const changeEvents = new Set<string>(Object.values(ProductChangeWorkflowEvents));
const sellerIdSchema = z.string().startsWith("sel_").max(128);

export function catalogNotificationEventIds(name: string, data: unknown) {
  if (!catalogEvents.has(name)) return [];
  const id = z.string().startsWith(changeEvents.has(name) ? "prodch_" : "prod_").max(128);
  const schema = z.object({ id: z.union([id, z.array(id).min(1).max(100)]) });
  const entries = Array.isArray(data) ? data : [data];
  if (!entries.length || entries.length > 100) return [];
  const parsed = z.array(schema).safeParse(entries);
  if (!parsed.success) return [];
  const ids = [...new Set(parsed.data.flatMap((entry) => entry.id))];
  return ids.length <= 100 ? ids : [];
}

export async function notifyCatalogChange(
  container: MedusaContainer,
  name: string,
  data: unknown,
) {
  const ids = catalogNotificationEventIds(name, data);
  if (!ids.length) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const sellers = new Set<string>();
  const addSeller = (id: unknown) => {
    const parsed = sellerIdSchema.safeParse(id);
    if (parsed.success) sellers.add(parsed.data);
  };
  let productIds = ids;
  if (changeEvents.has(name)) {
    const { data: changes } = await query.graph(
      {
        entity: "product_change",
        fields: ["id", "created_by", "product_id"],
        filters: { id: ids },
      },
      { cache: { enable: false } },
    );
    changes.forEach((change) => addSeller(change.created_by));
    productIds = [...new Set(changes.map((change) => change.product_id))];
  }
  if (productIds.length) {
    // Native ownership lives on PRODUCT_ADD actions, eligibility on the
    // product_seller link, and listings on offers. Event payloads never select
    // a seller or expose operator notes to a browser.
    const [{ data: authors }, { data: assigned }, { data: offers }] =
      await Promise.all([
        query.graph(
          {
            entity: "product_change_action",
            fields: ["product_change.created_by"],
            filters: {
              product_id: productIds,
              action: ProductChangeActionType.PRODUCT_ADD,
            },
          },
          { cache: { enable: false } },
        ),
        query.graph(
          {
            entity: "product_seller",
            fields: ["seller_id"],
            filters: { product_id: productIds },
          },
          { cache: { enable: false } },
        ),
        query.graph(
          {
            entity: "offer",
            fields: ["seller_id"],
            filters: { product_id: productIds },
          },
          { cache: { enable: false } },
        ),
      ]);
    authors.forEach((row) => addSeller(row.product_change?.created_by));
    assigned.forEach((row) => addSeller(row.seller_id));
    offers.forEach((row) => addSeller(row.seller_id));
  }
  if (!sellers.size) return;
  const notifications = container.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  await Promise.all(
    [...sellers].map((sellerId) => notifications.publishCatalogChanged(sellerId)),
  );
}
