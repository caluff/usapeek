import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type {
  IProductModuleService,
  UpdateProductDTO,
} from "@medusajs/framework/types";
import { z } from "@medusajs/framework/zod";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import {
  ProductChangeActionType,
  type ProductChangeActionDTO,
} from "@mercurjs/types";

const imagesSchema = z
  .array(z.object({ id: z.string().optional(), url: z.string() }))
  .max(100);
type ImageLink = { variant_id: string; image_id: string };
type GalleryPlan = {
  action_updates: Pick<ProductChangeActionDTO, "id" | "details">[];
  removals: ImageLink[];
  thumbnail_update: UpdateProductDTO[];
};
type GallerySnapshot = {
  id: string;
  images: { id: string; url: string }[];
  thumbnail?: string | null;
  links: ImageLink[];
};

export const prepareProductGalleryChangeStep = createStep<
  { change_id: string },
  GalleryPlan,
  GallerySnapshot | null
>(
  "prepare-product-gallery-change",
  async (input, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: changes } = await query.graph(
      {
        entity: "product_change",
        fields: [
          "product_id",
          "actions.id",
          "actions.action",
          "actions.details",
        ],
        filters: { id: input.change_id },
      },
      { cache: { enable: false } },
    );
    const change = changes[0];
    const imageAction = change?.actions?.find(
      (action) =>
        action?.action === ProductChangeActionType.UPDATE &&
        action.details?.field === "images",
    );
    const upload = change?.actions?.some(
      (action) =>
        action?.action === ProductChangeActionType.VARIANT_UPDATE &&
        z
          .object({
            fields: z.object({
              images: z.object({ add: z.array(z.string()).min(1) }),
            }),
          })
          .safeParse(action.details).success,
    );
    if (!imageAction || upload)
      return new StepResponse<GalleryPlan, GallerySnapshot | null>(
        { action_updates: [], removals: [], thumbnail_update: [] },
        null,
      );
    const proposed = imagesSchema.parse(imageAction.details?.value);
    const previous = imagesSchema.parse(imageAction.details?.previous_value);
    const desiredUrls = new Set(proposed.map((image) => image.url));
    const previousUrls = new Set(previous.map((image) => image.url));
    const removedUrls = new Set(
      previous
        .filter((image) => !desiredUrls.has(image.url))
        .map((image) => image.url),
    );
    const { data: products } = await query.graph(
      {
        entity: "product",
        fields: [
          "id",
          "thumbnail",
          "images.id",
          "images.url",
          "images.variants.id",
        ],
        filters: { id: change.product_id! },
      },
      { cache: { enable: false } },
    );
    const product = products[0];
    if (!product)
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found.");
    const gallery = (product.images ?? []).flatMap((image) =>
      image ? [{ id: image.id, url: image.url }] : [],
    );
    const retained = gallery.filter((image) => !removedUrls.has(image.url));
    const newImages = proposed.filter(
      (image) =>
        !previousUrls.has(image.url) &&
        !retained.some((current) => current.url === image.url),
    );
    const next = [...retained, ...newImages];
    if (!next.length)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "El producto necesita al menos una imagen.",
      );
    const { data: assignedImages } = await query.graph(
      {
        entity: "product_image",
        fields: ["id", "url", "variants.id"],
        filters: { product_id: product.id },
      },
      { cache: { enable: false } },
    );
    const removals = assignedImages.flatMap((image) =>
      image && removedUrls.has(image.url)
        ? (image.variants ?? []).flatMap((variant) =>
            variant ? [{ variant_id: variant.id, image_id: image.id }] : [],
          )
        : [],
    );
    const thumbnail =
      product.thumbnail && removedUrls.has(product.thumbnail)
        ? next[0].url
        : product.thumbnail;
    return new StepResponse(
      {
        action_updates: [
          {
            id: imageAction.id,
            details: { ...imageAction.details, value: next },
          },
        ],
        removals,
        thumbnail_update:
          thumbnail === product.thumbnail
            ? []
            : [{ id: product.id, thumbnail }],
      },
      {
        id: product.id,
        images: gallery,
        thumbnail: product.thumbnail,
        links: assignedImages.flatMap((image) =>
          (image.variants ?? []).flatMap((variant) =>
            variant ? [{ variant_id: variant.id, image_id: image.id }] : [],
          ),
        ),
      },
    );
  },
  async (snapshot, { container }) => {
    if (!snapshot) return;
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: snapshot.id,
            images: snapshot.images,
            thumbnail: snapshot.thumbnail,
          },
        ],
      },
    });
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph(
      {
        entity: "product_image",
        fields: ["id", "url", "variants.id"],
        filters: { product_id: snapshot.id },
      },
      { cache: { enable: false } },
    );
    const missing = snapshot.links.flatMap((link) => {
      const url = snapshot.images.find(
        (image) => image.id === link.image_id,
      )?.url;
      const restored = data.find((image) => image.url === url);
      return restored &&
        !restored.variants?.some((variant) => variant?.id === link.variant_id)
        ? [{ ...link, image_id: restored.id }]
        : [];
    });
    if (missing.length)
      await container
        .resolve<IProductModuleService>(Modules.PRODUCT)
        .addImageToVariant(missing);
  },
);

export const unlinkProductGalleryVariantsStep = createStep(
  "unlink-product-gallery-variants",
  async (input: { variant_id: string; image_id: string }[], { container }) => {
    if (input.length)
      await container
        .resolve<IProductModuleService>(Modules.PRODUCT)
        .removeImageFromVariant(input);
    return new StepResponse(void 0);
  },
);
