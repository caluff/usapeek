import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { archiveProductOffersWorkflow } from "../workflows/archive-product-offers";

export default async function archiveDeletedProductOffers({
  event: { data },
  container,
}: SubscriberArgs<{ id: string } | { id: string }[]>) {
  const entries = Array.isArray(data) ? data : [data];
  for (const productId of new Set(entries.map(({ id }) => id))) {
    await archiveProductOffersWorkflow(container).run({
      input: { product_id: productId },
    });
  }
}

export const config: SubscriberConfig = { event: "product.deleted" };
