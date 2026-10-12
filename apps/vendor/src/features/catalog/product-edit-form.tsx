"use client";

import { useActionState, useRef, useState } from "react";
import type { ProductDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { useFormUnsavedChanges } from "../workspace/unsaved-changes";
import { ProductImages, type ProductImagesHandle } from "./product-images";
import { CATALOG_IMAGE_COUNT } from "./media-validation";
import { specificationDraft } from "./product-specifications";
import { ProductAttributesFields } from "./product-attributes-fields";
import { ProductDetailsFields } from "./product-details-fields";
import { ProductCategoryGroup } from "./product-category-group";
import type { ProductFormProps } from "./product-form-types";

export function ProductEditForm({
  product,
  section = "details",
  action,
  categories,
  organization,
  disabled = false,
  onSaved,
  onCancel,
  onBusyChange,
}: ProductFormProps & { product: ProductDTO }) {
  const images = product.images ?? [];
  const assignedImageIds = new Set(
    (product.variants ?? []).flatMap((variant) =>
      (variant.images ?? []).map(({ id }) => id),
    ),
  );
  const maxImages = Math.min(
    100,
    Math.max(images.length, CATALOG_IMAGE_COUNT + assignedImageIds.size),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const imagePicker = useRef<ProductImagesHandle>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [specifications, setSpecifications] = useState(() =>
    specificationDraft(product),
  );
  const [imageIds, setImageIds] = useState(() => images.map(({ id }) => id));
  const unsaved = useFormUnsavedChanges(
    formRef,
    JSON.stringify({ specifications, imageIds }),
  );
  const [state, formAction, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      onBusyChange?.(true);
      try {
        if (section === "media") {
          if (!imagePicker.current)
            throw new Error("Espera a que carguen las imágenes.");
          const images = await imagePicker.current.prepare();
          if (!images.length)
            throw new Error("El producto necesita al menos una imagen.");
          form.set("images", JSON.stringify(images));
        }
        const result = await action(previous, form);
        notifyFeedback(result);
        if (result.status === "success") {
          unsaved.markSaved();
          onSaved?.();
        }
        return result;
      } catch (error) {
        const result: MutationState = {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudieron guardar los cambios.",
        };
        notifyFeedback(result);
        return result;
      } finally {
        onBusyChange?.(false);
      }
    },
    { status: "idle" },
  );
  return (
    <form
      ref={formRef}
      action={formAction}
      onChangeCapture={unsaved.onChange}
      onSubmit={(event) => {
        if (disabled || isPending || isUploading) event.preventDefault();
      }}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={product.id} />
      <fieldset
        disabled={disabled || isPending || isUploading}
        className="space-y-6"
      >
        {section === "details" ? (
          <ProductDetailsFields product={product} />
        ) : null}
        {section === "organization" ? (
          <>
            {organization}
            <ProductCategoryGroup>{categories}</ProductCategoryGroup>
          </>
        ) : null}
        {section === "attributes" ? (
          <ProductAttributesFields
            value={specifications}
            onChange={setSpecifications}
            scope="product"
          />
        ) : null}
        {section === "media" ? (
          <ProductImages
            ref={imagePicker}
            initialImages={images}
            scope="gallery"
            maxImages={maxImages}
            disabled={disabled || isPending}
            onBusyChange={setIsUploading}
            onImagesChange={setImageIds}
          />
        ) : null}
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={onCancel}
            >
              Cancelar
            </Button>
          ) : null}
          <Button type="submit" disabled={isUploading}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </fieldset>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
