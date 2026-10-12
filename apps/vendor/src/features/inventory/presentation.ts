import type { InventoryItemWithLevels } from "./data";

export function inventoryProducts(item: InventoryItemWithLevels) {
  const products = new Map<
    string,
    {
      id: string;
      title: string;
      thumbnail?: string | null;
      presentation: string;
    }
  >();
  for (const offer of item.offers ?? []) {
    if (!offer.product?.id) continue;
    const variant = offer.product_variant;
    const options = variant?.options
      ?.filter(({ value }) => value !== "__default__")
      ?.map(({ value, option }) =>
        option?.title && option.title !== "__default__"
          ? `${option.title}: ${value}`
          : value,
      )
      .filter(Boolean);
    const title = variant?.title?.trim() ?? "";
    const presentation = options?.length
      ? options.join(" · ")
      : variant?.options?.length ||
          /^(__default__|default( variant| title)?|predeterminada?)$/i.test(
            title,
          )
        ? ""
        : title;
    products.set(`${offer.product.id}:${variant?.id ?? offer.id}`, {
      id: offer.product.id,
      title: offer.product.title,
      thumbnail: offer.product.thumbnail,
      presentation,
    });
  }
  return [...products.values()];
}
