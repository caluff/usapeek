import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export async function inventoryIdsByProductName(
  container: MedusaContainer,
  sellerId: string,
  name: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const literalName = name.replace(/[\\%_]/g, "\\$&");
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { title: { $ilike: `%${literalName}%` } },
  });
  if (!products.length) return [];

  // Offers own inventory; master variants do not hold a seller's stock.
  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["inventory_items.id"],
    filters: {
      seller_id: sellerId,
      product_id: products.map((product) => product.id),
    },
  });
  return [
    ...new Set(
      offers.flatMap((offer) =>
        (offer.inventory_items ?? []).flatMap((item) =>
          item ? [item.id] : [],
        ),
      ),
    ),
  ];
}
