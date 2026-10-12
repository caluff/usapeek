import "server-only";

import type { OrderLineItemDTO } from "@medusajs/types";
import type { HttpTypes } from "@mercurjs/types";
import { unstable_rethrow } from "next/navigation";
import { workspace } from "@/features/workspace/data";

export type OrderImageItem = Pick<
  OrderLineItemDTO,
  "id" | "title" | "thumbnail" | "product_id"
>;
export type ProductThumbnails = ReadonlyMap<string, string>;

export async function productThumbnailsForOrderItems(
  items: readonly OrderImageItem[],
): Promise<ProductThumbnails> {
  const ids = [
    ...new Set(
      items.flatMap((item) =>
        !item.thumbnail && item.product_id ? [item.product_id] : [],
      ),
    ),
  ];
  if (!ids.length) return new Map();

  try {
    const { client } = await workspace();
    const batches = [];
    for (let index = 0; index < ids.length; index += 100) {
      batches.push(ids.slice(index, index + 100));
    }
    const results = await Promise.all(
      batches.map((id) =>
        client.get<HttpTypes.VendorProductListResponse>("/vendor/products", {
          id,
          limit: id.length,
          fields: "id,thumbnail,images.url",
        }),
      ),
    );
    return new Map(
      results.flatMap(({ products }) =>
        products.flatMap((product) => {
          const src = product.thumbnail || product.images?.[0]?.url;
          return src ? [[product.id, src] as const] : [];
        }),
      ),
    );
  } catch (error) {
    unstable_rethrow(error);
    return new Map();
  }
}

export async function orderImageItems(ids: readonly string[]): Promise<{
  orders: HttpTypes.VendorOrderListResponse["orders"];
  products: Promise<ProductThumbnails>;
}> {
  if (!ids.length) return { orders: [], products: Promise.resolve(new Map()) };
  try {
    const { client } = await workspace();
    const { orders } = await client.get<HttpTypes.VendorOrderListResponse>(
      "/vendor/orders",
      {
        id: ids,
        limit: ids.length,
        fields: "id,items.id,items.title,items.thumbnail,items.product_id",
      },
    );
    return {
      orders,
      products: productThumbnailsForOrderItems(
        orders.flatMap((order) => order.items ?? []),
      ),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { orders: [], products: Promise.resolve(new Map()) };
  }
}
