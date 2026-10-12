import type Medusa from "@medusajs/js-sdk";
import type { FulfillmentDTO, HttpTypes } from "@medusajs/types";
import type { SellerDTO } from "@mercurjs/types";
import { orderSearchQuery } from "@usapeek/order-reference";
import type { parseOrderFilters } from "./helpers";
import { safeUrl } from "./helpers";

export type OperatorOrder = Omit<HttpTypes.AdminOrder, "fulfillments"> & {
  fulfillments?: Array<
    HttpTypes.AdminOrderFulfillment & Pick<FulfillmentDTO, "labels">
  >;
  seller?: Pick<SellerDTO, "id" | "name"> | null;
};

// Explicit relation counters are required by Medusa's order formatter.
export const ORDER_FIELDS =
  "id,display_id,custom_display_id,created_at,status,email,currency_code,total,item_total,discount_total,shipping_total,tax_total,payment_status,fulfillment_status,seller.id,seller.name,customer.first_name,customer.last_name,items.id,items.product_id,items.title,items.thumbnail,items.variant.product.thumbnail,items.variant.product.images.url,items.quantity,items.unit_price,items.total,items.detail.quantity,items.detail.fulfilled_quantity,items.detail.return_requested_quantity,items.detail.return_received_quantity,items.detail.return_dismissed_quantity,items.detail.shipped_quantity,items.detail.delivered_quantity,shipping_address.*,shipping_methods.*,fulfillments.id,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.canceled_at,fulfillments.labels.*";

export function orderItemImage(item: HttpTypes.AdminOrderLineItem) {
  return (
    safeUrl(item.thumbnail) ??
    safeUrl(item.variant?.product?.thumbnail) ??
    safeUrl(item.variant?.product?.images?.[0]?.url)
  );
}

export async function listOrders(
  sdk: Medusa,
  filters: ReturnType<typeof parseOrderFilters>,
) {
  const result = await sdk.admin.order.list({
    q: orderSearchQuery(filters.q) || undefined,
    status: filters.status === "all" ? undefined : [filters.status],
    limit: filters.limit,
    offset: filters.offset,
    order: "-created_at",
    fields: ORDER_FIELDS,
  });
  return { ...result, orders: result.orders as OperatorOrder[] };
}

export async function retrieveOrder(
  sdk: Medusa,
  id: string,
): Promise<OperatorOrder> {
  const { order } = await sdk.admin.order.retrieve(id, {
    fields: ORDER_FIELDS,
  });
  return order as OperatorOrder;
}

export async function orderProductImages(
  sdk: Medusa,
  orders: Pick<HttpTypes.AdminOrder, "items">[],
) {
  const ids = [
    ...new Set(
      orders
        .flatMap((order) => order.items ?? [])
        .filter((item) => !orderItemImage(item))
        .flatMap((item) => (item.product_id ? [item.product_id] : [])),
    ),
  ];
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += 100)
    batches.push(ids.slice(index, index + 100));
  const results = await Promise.allSettled(
    batches.map((id) =>
      sdk.admin.product.list({
        id,
        fields: "id,thumbnail,images.url",
        limit: id.length,
      }),
    ),
  );
  const images = new Map<string, string>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const product of result.value.products) {
      const url =
        safeUrl(product.thumbnail) ?? safeUrl(product.images?.[0]?.url);
      if (url) images.set(product.id, url);
    }
  }
  return images;
}
