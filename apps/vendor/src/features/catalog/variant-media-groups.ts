import type { ProductImageDTO } from "@medusajs/types";

type Media = { images?: Pick<ProductImageDTO, "id" | "url">[] | null };

export function variantMediaGroups(
  product: Media & { variants?: Media[] | null },
  variant: Media,
) {
  const linkedIds = new Set(
    (product.variants ?? []).flatMap((entry) =>
      (entry.images ?? []).map((image) => image.id),
    ),
  );
  return {
    generalImages: (product.images ?? []).filter(
      (image) => !linkedIds.has(image.id),
    ),
    ownImages: variant.images ?? [],
  };
}
