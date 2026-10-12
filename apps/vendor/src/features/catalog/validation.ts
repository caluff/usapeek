import type { CreateProductDTO } from "@mercurjs/types";
import { AttributeType } from "@mercurjs/types";
import type {
  CreateProductVariantDTO,
  HttpTypes as MedusaHttpTypes,
} from "@medusajs/types";
import { resourceId, stockQuantity, textField } from "../workspace/validation";
import { usdAmount } from "../offers/price-validation";
import {
  productSpecifications,
  variantSpecifications,
  type SpecificationDraft,
} from "./product-specifications";

export type CatalogAxis = { title: string; values: string[] };
export type CatalogVariant = {
  title: string;
  sku: string;
  options: Record<string, string>;
  specifications?: SpecificationDraft;
  amount?: string;
  stockedQuantity?: string;
  imageIndexes?: number[];
};
type MasterSkuFactory = (
  variant: Pick<CatalogVariant, "title" | "options">,
  index: number,
) => string;

export function variantCombinations(
  axes: CatalogAxis[],
): Record<string, string>[] {
  if (axes.length > 3) throw new Error("Puedes definir hasta tres opciones.");
  if (
    new Set(axes.map((axis) => axis.title.toLowerCase())).size !== axes.length
  )
    throw new Error("Los nombres de las opciones no pueden repetirse.");
  let result: Record<string, string>[] = [{}];
  for (const axis of axes) {
    if (
      !axis.title.trim() ||
      axis.title.length > 100 ||
      !axis.values.length ||
      axis.values.length > 30 ||
      axis.values.some((value) => !value.trim() || value.length > 100)
    )
      throw new Error("Completa el nombre y los valores de cada opción.");
    if (
      new Set(axis.values.map((value) => value.toLowerCase())).size !==
      axis.values.length
    )
      throw new Error("Los valores de una opción no pueden repetirse.");
    if (result.length * axis.values.length > 100)
      throw new Error("El producto admite hasta 100 combinaciones.");
    result = result.flatMap((options) =>
      axis.values.map((value) => ({ ...options, [axis.title]: value })),
    );
  }
  return result;
}

function jsonArray(form: FormData, name: string): unknown[] {
  const raw = textField(form, name, true, 100000);
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value))
    throw new Error("El formulario de variantes no es válido.");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("El formulario de variantes no es válido.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new Error("Completa los datos de la variante.");
  return value.trim();
}
export function selectedCategories(form: FormData) {
  const ids = form
    .getAll("category_id")
    .map((value) => resourceId(String(value)));
  if (ids.length > 20 || new Set(ids).size !== ids.length)
    throw new Error("Selecciona hasta 20 categorías sin repetirlas.");
  return ids.map((id) => ({ id }));
}

export function submittedImages(form: FormData, maxImages = 6) {
  const entries = JSON.parse(
    textField(form, "images", false, maxImages * 2100 + 1000) || "[]",
  ) as unknown;
  if (!Array.isArray(entries) || entries.length > maxImages)
    throw new Error(`El producto admite hasta ${maxImages} imágenes.`);
  return entries.map((entry) => {
    const image = object(entry);
    if (typeof image.url !== "string" || image.url.length > 2048)
      throw new Error("La imagen adjunta no es válida.");
    const url = new URL(image.url);
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("La imagen adjunta no es válida.");
    return { url: image.url };
  });
}

export function createCatalogBody(
  form: FormData,
  createMasterSku?: MasterSkuFactory,
) {
  if (textField(form, "status", true) !== "proposed")
    throw new Error("Los nuevos productos deben enviarse a aprobación.");
  if (!form.has("categories_present"))
    throw new Error(
      "Espera a que se carguen las categorías antes de enviar el producto.",
    );
  const axes = jsonArray(form, "axes").map((value) => {
    const axis = object(value);
    if (!Array.isArray(axis.values))
      throw new Error("Completa los valores de la opción.");
    return { title: string(axis.title), values: axis.values.map(string) };
  });
  const combinations = variantCombinations(axes);
  const submittedVariants = jsonArray(form, "variants");
  const variants: CreateProductVariantDTO[] = submittedVariants.map(
    (value, index) => {
      const variant = object(value);
      const title = string(variant.title);
      const options = Object.fromEntries(
        Object.entries(object(variant.options)).map(([key, optionValue]) => [
          key,
          string(optionValue),
        ]),
      );
      const submittedSku =
        typeof variant.sku === "string" ? variant.sku.trim() : "";
      const sku =
        submittedSku || createMasterSku?.({ title, options }, index) || "";
      if (!sku || sku.length > 100)
        throw new Error("El SKU maestro admite hasta 100 caracteres.");
      return {
        title,
        sku,
        options,
        ...variantSpecifications(
          object(variant.specifications ?? {}),
          "create",
        ),
      };
    },
  );
  const key = (options: Record<string, string>) =>
    JSON.stringify(
      Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
    );
  const expected = new Set(combinations.map(key));
  if (
    variants.length !== expected.size ||
    new Set(variants.map((variant) => key(variant.options ?? {}))).size !==
      expected.size ||
    variants.some((variant) => !expected.has(key(variant.options ?? {})))
  )
    throw new Error("Incluye cada combinación de opciones una sola vez.");
  if (new Set(variants.map((variant) => variant.sku)).size !== variants.length)
    throw new Error("Cada variante necesita un SKU maestro distinto.");
  const images = submittedImages(form);
  const initialOffers = form.has("initial_offers_present")
    ? submittedVariants.map((value, index) => {
        const variant = object(value);
        return {
          variant_sku: variants[index].sku!,
          amount: usdAmount(
            typeof variant.amount === "string" ? variant.amount : "",
          ),
          stocked_quantity: stockQuantity(
            typeof variant.stockedQuantity === "string"
              ? variant.stockedQuantity
              : "0",
          ),
          shipping_profile_id: resourceId(
            textField(form, "shipping_profile_id", true),
          ),
        };
      })
    : undefined;
  const initialVariantImages = submittedVariants.flatMap((value, index) => {
    const draft = object(value);
    if (draft.imageIndexes === undefined) return [];
    if (
      !Array.isArray(draft.imageIndexes) ||
      new Set(draft.imageIndexes).size !== draft.imageIndexes.length ||
      draft.imageIndexes.some(
        (at) => !Number.isInteger(at) || at < 0 || at >= images.length,
      )
    )
      throw new Error("Revisa las imágenes seleccionadas para la variante.");
    return [
      {
        variant_sku: variants[index].sku!,
        image_urls: draft.imageIndexes.map((at: number) => images[at].url),
      },
    ];
  });
  return {
    title: textField(form, "title", true, 200),
    ...(textField(form, "handle", false, 200)
      ? { handle: textField(form, "handle", false, 200) }
      : {}),
    ...(form.has("discountable_present")
      ? { discountable: form.get("discountable") === "true" }
      : {}),
    ...(textField(form, "type_id")
      ? { type_id: resourceId(textField(form, "type_id")) }
      : {}),
    ...(textField(form, "collection_id")
      ? { collection_id: resourceId(textField(form, "collection_id")) }
      : {}),
    ...(form.has("tag_id")
      ? {
          tags: form
            .getAll("tag_id")
            .map((id) => ({ id: resourceId(String(id)) })),
        }
      : {}),
    subtitle: textField(form, "subtitle", false, 200),
    description: textField(form, "description", false, 10000),
    ...productSpecifications(form, "create"),
    status: "proposed",
    categories: selectedCategories(form),
    attributes: axes.map((axis) => ({
      ...axis,
      type: AttributeType.MULTI_SELECT,
      is_variant_axis: true,
    })),
    variants,
    images,
    ...(initialOffers || initialVariantImages.length
      ? {
          additional_data: {
            ...(initialOffers ? { initial_offers: initialOffers } : {}),
            ...(initialVariantImages.length
              ? { initial_variant_images: initialVariantImages }
              : {}),
          },
        }
      : {}),
  } satisfies CreateProductDTO &
    Pick<MedusaHttpTypes.AdminCreateProduct, "categories" | "tags">;
}
