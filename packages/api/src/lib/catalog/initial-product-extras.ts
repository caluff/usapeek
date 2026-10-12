import type {
  ProductImageDTO,
  ProductVariantDTO,
} from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

const sku = z.string().trim().min(1).max(100);
const initialProductExtrasSchema = z.object({
  initial_offers: z
    .array(
      z
        .object({
          variant_sku: sku,
          amount: z.number().finite().nonnegative(),
          stocked_quantity: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER),
          shipping_profile_id: z.string().trim().min(1),
        })
        .strict(),
    )
    .min(1)
    .max(100)
    .optional(),
  initial_variant_images: z
    .array(
      z
        .object({
          variant_sku: sku,
          image_urls: z.array(z.string().url()).min(1).max(100),
        })
        .strict(),
    )
    .min(1)
    .max(100)
    .optional(),
});

export type InitialProductExtras = z.infer<typeof initialProductExtrasSchema>;

function invalid(message: string): never {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
}

export function validateInitialProductExtras(product: {
  variants?: { sku?: string | null }[];
  images?: { url: string }[];
  additional_data?: Record<string, unknown>;
}): InitialProductExtras {
  const parsed = initialProductExtrasSchema.safeParse(
    product.additional_data ?? {},
  );
  if (!parsed.success)
    invalid(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  const extras = parsed.data;
  const skus = new Set((product.variants ?? []).map((variant) => variant.sku));
  for (const entries of [
    extras.initial_offers,
    extras.initial_variant_images,
  ]) {
    if (!entries) continue;
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!skus.has(entry.variant_sku) || seen.has(entry.variant_sku))
        invalid(
          "Initial product data requires distinct existing variant SKUs.",
        );
      seen.add(entry.variant_sku);
    }
  }
  if (extras.initial_offers && extras.initial_offers.length !== skus.size)
    invalid("Initial offers must cover every product variant.");
  const urls = new Set((product.images ?? []).map((image) => image.url));
  for (const entry of extras.initial_variant_images ?? []) {
    if (
      new Set(entry.image_urls).size !== entry.image_urls.length ||
      entry.image_urls.some((url) => !urls.has(url))
    )
      invalid("Variant images must be distinct images of this product.");
  }
  return extras;
}

export function resolveInitialProductExtras(
  extras: InitialProductExtras,
  variants: Pick<ProductVariantDTO, "id" | "sku">[],
  images: Pick<ProductImageDTO, "id" | "url">[],
) {
  const bySku = new Map(variants.map((variant) => [variant.sku, variant.id]));
  const byUrl = new Map(images.map((image) => [image.url, image.id]));
  const variantId = (sku: string) =>
    bySku.get(sku) ?? invalid("Initial product variant was not persisted.");
  return {
    offers: (extras.initial_offers ?? []).map((offer) => ({
      ...offer,
      variant_id: variantId(offer.variant_sku),
    })),
    images: (extras.initial_variant_images ?? []).map((entry) => ({
      variant_id: variantId(entry.variant_sku),
      add: entry.image_urls.map(
        (url) =>
          byUrl.get(url) ?? invalid("Initial product image was not persisted."),
      ),
      remove: [] as string[],
    })),
  };
}
