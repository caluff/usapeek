import type { HttpTypes } from "@mercurjs/types";
import type { ProductThumbnails } from "./image-data";
import { readDashboardData } from "../dashboard/live-data";

export function missingListThumbnailIds(
  orders: HttpTypes.VendorOrderListResponse["orders"],
  known: ProductThumbnails,
  attempted: ReadonlySet<string>,
) {
  return [
    ...new Set(
      orders.flatMap((order) =>
        (order.items ?? []).slice(0, 3).flatMap((item) =>
          !item.thumbnail &&
          item.product_id &&
          !known.has(item.product_id) &&
          !attempted.has(item.product_id)
            ? [item.product_id]
            : [],
        ),
      ),
    ),
  ];
}

export async function readListThumbnails(
  sellerId: string,
  ids: readonly string[],
  signal: AbortSignal,
) {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += 15)
    batches.push(ids.slice(index, index + 15));
  const results = await Promise.all(
    batches.map((batch) => {
      const query = new URLSearchParams({ seller_id: sellerId });
      batch.forEach((id) => query.append("id", id));
      return readDashboardData<Record<string, string>>(
        `/seller/dashboard/order-images?${query}`,
        signal,
      );
    }),
  );
  return new Map(results.flatMap((images) => Object.entries(images)));
}
