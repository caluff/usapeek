import { z } from "@medusajs/framework/zod";
import { VendorUpdateProductVariant } from "@mercurjs/core/api/vendor/products/validators";
import { generateEntityId, MedusaError } from "@medusajs/framework/utils";
import {
  ProductChangeActionType,
  type CreateProductChangeActionDTO,
} from "@mercurjs/types";
import { MAX_CATALOG_IMAGES } from "../catalog-media/validation";

export const VariantMediaUpdateSchema = z.strictObject({
  variant: VendorUpdateProductVariant.omit({ images: true }),
  images: z
    .strictObject({
      ids: z.array(z.string().min(1)).max(MAX_CATALOG_IMAGES),
      uploads: z
        .array(z.strictObject({ url: z.string().min(1).max(2048) }))
        .min(1)
        .max(MAX_CATALOG_IMAGES),
    })
    .refine(
      ({ ids, uploads }) => ids.length + uploads.length <= MAX_CATALOG_IMAGES,
      "Use at most six variant images.",
    ),
});
export type VariantMediaUpdate = z.infer<typeof VariantMediaUpdateSchema>;

export function variantMediaActions(
  productId: string,
  variantId: string,
  body: VariantMediaUpdate,
  gallery: {
    id: string;
    url: string;
    variants?: ({ id: string } | null)[] | null;
  }[],
): Omit<CreateProductChangeActionDTO, "product_change_id">[] {
  const ids = body.images.ids;
  const urls = body.images.uploads.map(({ url }) => url);
  if (
    new Set(ids).size !== ids.length ||
    new Set(urls).size !== urls.length ||
    ids.some((id) => !gallery.some((image) => image.id === id))
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Revisa las imágenes de esta variante.",
    );
  }
  const added = body.images.uploads
    .filter((image) => !gallery.some((current) => current.url === image.url))
    .map((image) => ({
      id: generateEntityId(undefined, "img"),
      url: image.url,
    }));
  const nextGallery = [
    ...gallery.map(({ id, url }) => ({ id, url })),
    ...added,
  ];
  const selected = new Set([
    ...ids,
    ...urls.map((url) => nextGallery.find((image) => image.url === url)!.id),
  ]);
  const assigned = gallery
    .filter((image) =>
      image.variants?.some((variant) => variant?.id === variantId),
    )
    .map((image) => image.id);
  return [
    ...(added.length
      ? [
          {
            product_id: productId,
            action: ProductChangeActionType.UPDATE,
            details: {
              field: "images",
              value: nextGallery,
              previous_value: gallery.map(({ id, url }) => ({ id, url })),
            },
          },
        ]
      : []),
    {
      product_id: productId,
      action: ProductChangeActionType.VARIANT_UPDATE,
      details: {
        variant_id: variantId,
        fields: {
          ...body.variant,
          images: {
            add: [...selected].filter((id) => !assigned.includes(id)),
            remove: assigned.filter((id) => !selected.has(id)),
          },
        },
      },
    },
  ];
}
