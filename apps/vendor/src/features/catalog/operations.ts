import type { ProductDTO, ProductChangeDTO } from "@mercurjs/types";
import { scopedClient, type AuthorizeVendor } from "../workspace/operations";
import { resourceId, textField } from "../workspace/validation";
import { createMasterSku } from "./master-sku";
import { variantSpecifications } from "./product-specifications";
import { usdAmount } from "../offers/price-validation";
import { stockQuantity } from "../workspace/validation";

export function catalogOperations(authorize: AuthorizeVendor) {
  return {
    async createVariant(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const product = await client.get<Pick<ProductDTO, "options">>(
        `/vendor/products/${id}/catalog-options`,
      );
      const options = Object.fromEntries(
        (product.options ?? []).map((option, index) => [
          option.title,
          textField(form, `option_${index}`, true, 200),
        ]),
      );
      const title = textField(form, "title", true, 200);
      const images = variantMediaChanges(form, []);
      const uploads = variantUploadedImages(form);
      if (images.add.length + uploads.length > 6)
        throw new Error(
          "Selecciona hasta 6 imágenes propias para la variante.",
        );
      return client.post<{ product_change: ProductChangeDTO }>(
        `/vendor/products/${id}/variant-configurations`,
        {
          variant: {
            title,
            sku: createMasterSku(
              `${id}-${title}-${Object.values(options).join("-")}`,
            ),
            options,
            ...variantSpecifications(form, "create"),
          },
          images: { ids: images.add, uploads },
          offer: {
            amount: usdAmount(textField(form, "amount", true)),
            stocked_quantity: stockQuantity(
              textField(form, "stocked_quantity", true),
            ),
            shipping_profile_id: resourceId(
              textField(form, "shipping_profile_id", true),
            ),
          },
        },
      );
    },
    async editVariant(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const variantId = textField(form, "variant_id");
      if (variantId) resourceId(variantId);
      const product = await client.get<
        Pick<ProductDTO, "options" | "variants">
      >(`/vendor/products/${id}/catalog-options`);
      if (
        variantId &&
        !product.variants?.some((variant) => variant.id === variantId)
      )
        throw new Error("La variante no pertenece a este producto.");
      const options = Object.fromEntries(
        (product.options ?? []).map((option, index) => {
          const value = textField(form, `option_${index}`, true, 200);
          if (!option.values?.some((entry) => entry.value === value))
            throw new Error("Selecciona un valor disponible para cada opción.");
          return [option.title, value];
        }),
      );
      const title = textField(form, "title", true, 200);
      const media =
        form.has("variant_images") && variantId
          ? variantMediaChanges(
              form,
              product.variants?.find((variant) => variant.id === variantId)
                ?.images ?? [],
            )
          : undefined;
      const uploads = variantUploadedImages(form);
      const fields = {
        title,
        sku: variantId
          ? textField(form, "master_sku", true, 100)
          : createMasterSku(`${id}-${title}`),
        options,
        ...variantSpecifications(form, variantId ? "update" : "create"),
      };
      if (uploads.length) {
        if (!variantId || !media)
          throw new Error("Guarda la variante antes de añadir sus imágenes.");
        const existing =
          product.variants?.find((variant) => variant.id === variantId)
            ?.images ?? [];
        const selected = [
          ...existing
            .map((image) => image.id)
            .filter((imageId) => !media.remove.includes(imageId)),
          ...media.add,
        ];
        if (selected.length + uploads.length > 6)
          throw new Error(
            "Selecciona hasta 6 imágenes propias para la variante.",
          );
        return client.post<{ product_change: ProductChangeDTO }>(
          `/vendor/products/${id}/variants/${variantId}/media`,
          { variant: fields, images: { ids: selected, uploads } },
        );
      }
      return client.post<{ product_change: ProductChangeDTO }>(
        `/vendor/products/${id}/variants${variantId ? `/${variantId}` : ""}`,
        {
          ...fields,
          ...(media ? { images: media } : {}),
        },
      );
    },
    async extendAxis(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const attributeId = resourceId(textField(form, "attribute_id", true));
      const values = textField(form, "values", true, 3000)
        .split(",")
        .map((value) => value.trim());
      if (
        values.length > 30 ||
        values.some((value) => !value || value.length > 100) ||
        new Set(values).size !== values.length
      )
        throw new Error(
          "Introduce hasta 30 valores distintos separados por comas.",
        );
      return client.post<{ product_change: ProductChangeDTO }>(
        `/vendor/products/${id}/attributes/batch`,
        {
          update: [
            { id: attributeId, add: values.map((value) => ({ value })) },
          ],
        },
      );
    },
  };
}

export function variantUploadedImages(form: FormData): { url: string }[] {
  if (!form.has("variant_uploaded_images")) return [];
  const value: unknown = JSON.parse(
    textField(form, "variant_uploaded_images", true, 15000),
  );
  if (
    !Array.isArray(value) ||
    value.length > 6 ||
    value.some(
      (image) =>
        !image ||
        typeof image !== "object" ||
        !("url" in image) ||
        typeof image.url !== "string" ||
        image.url.length > 2048 ||
        !/^https?:\/\//.test(image.url),
    )
  )
    throw new Error("Revisa las imágenes añadidas a la variante.");
  const images = value.map((image) => ({ url: String(image.url) }));
  if (new Set(images.map((image) => image.url)).size !== images.length)
    throw new Error("No repitas imágenes para la variante.");
  return images;
}

export function variantMediaChanges(
  form: FormData,
  existing: { id: string }[],
) {
  const value: unknown = JSON.parse(
    textField(form, "variant_images", true, 10000),
  );
  if (
    !Array.isArray(value) ||
    value.length > 6 ||
    value.some((id) => typeof id !== "string") ||
    new Set(value).size !== value.length
  )
    throw new Error("Revisa las imágenes seleccionadas para la variante.");
  const selected = value.map((id) => resourceId(String(id)));
  const current = new Set(existing.map(({ id }) => id));
  return {
    add: selected.filter((id) => !current.has(id)),
    remove: [...current].filter((id) => !selected.includes(id)),
  };
}
