import type { HttpTypes } from "@medusajs/types";
import { getProductImage } from "./image";

export function getProductImageSources(
  product: Pick<HttpTypes.StoreProduct, "images" | "thumbnail">,
) {
  const images = product.images ?? [];
  const generalImages = images.filter(
    (image) =>
      !("variants" in image) ||
      !Array.isArray(image.variants) ||
      image.variants.length === 0,
  );
  const thumbnailImage = images.find(({ url }) => url === product.thumbnail);
  const thumbnail =
    !thumbnailImage || generalImages.includes(thumbnailImage)
      ? product.thumbnail
      : undefined;

  return [
    ...new Set(
      [thumbnail, ...generalImages.map(({ url }) => url)].flatMap((source) => {
        const image = getProductImage(source);
        return image ? [image.source] : [];
      }),
    ),
  ];
}

export function getLinkedVariantImages(
  images: HttpTypes.StoreProduct["images"],
  variantId: HttpTypes.StoreProductVariant["id"],
) {
  return (images ?? []).filter((image) => {
    if (!("variants" in image) || !Array.isArray(image.variants)) return false;
    return image.variants.some(
      (variant: unknown) =>
        variant !== null &&
        typeof variant === "object" &&
        "id" in variant &&
        variant.id === variantId,
    );
  });
}

export function getVariantImageSources(
  productSources: string[],
  variant:
    Pick<HttpTypes.StoreProductVariant, "thumbnail" | "images"> | undefined,
  variantCount: number,
) {
  const assignedImages = variant?.images ?? [];
  const thumbnail =
    (variantCount === 1 && !assignedImages.length) ||
    assignedImages.some(({ url }) => url === variant?.thumbnail)
      ? variant?.thumbnail
      : undefined;
  const variantSources = [
    thumbnail,
    ...assignedImages
      .toSorted((first, second) => (first.rank ?? 0) - (second.rank ?? 0))
      .map(({ url }) => url),
  ].flatMap((source) => {
    const image = getProductImage(source);
    return image ? [image.source] : [];
  });
  return variantSources.length
    ? [
        ...new Set([
          ...variantSources,
          ...(variantCount === 1 ? productSources : []),
        ]),
      ]
    : productSources;
}
