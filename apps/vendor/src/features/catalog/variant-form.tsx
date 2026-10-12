"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { useFormUnsavedChanges } from "../workspace/unsaved-changes";
import { editVariantAction } from "./actions";
import { usePresentationEditor } from "./presentation-editor";
import { specificationDraft } from "./product-specifications";
import { VariantSpecificationFields } from "./variant-specification-fields";
import { VariantMediaFields } from "./variant-media-fields";
import { variantMediaGroups } from "./variant-media-groups";
import { ProductImages, type ProductImagesHandle } from "./product-images";
import {
  hasPresentationOptions,
  hasVariantCombination,
  nextVariantOptions,
  variantOptionValues,
} from "./variant-options";

export function VariantForm({
  product,
  variant,
  defaultSku,
}: {
  product: ProductDTO;
  variant?: ProductVariantDTO;
  defaultSku?: string;
}) {
  const prefix = useId();
  const editor = usePresentationEditor();
  const hasOptions = hasPresentationOptions(product);
  const media = variant ? variantMediaGroups(product, variant) : undefined;
  const imagePicker = useRef<ProductImagesHandle>(null);
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [isValidatingImages, setValidatingImages] = useState(false);
  const [specifications, setSpecifications] = useState(() =>
    specificationDraft(variant),
  );
  const [imageIds, setImageIds] = useState(
    () => variant?.images?.map(({ id }) => id) ?? [],
  );
  const [selectedOptions, setSelectedOptions] = useState(() =>
    variant
      ? variantOptionValues(product, variant)
      : nextVariantOptions(product),
  );
  const automaticTitle = (
    selectedOptions?.filter((value) => value !== "__default__").join(" / ") ||
    "Única"
  ).slice(0, 200);
  const formRef = useRef<HTMLFormElement>(null);
  const unsaved = useFormUnsavedChanges(
    formRef,
    JSON.stringify({ specifications, imageIds, selectedOptions, uploadIds }),
  );
  const hasDuplicate =
    selectedOptions !== null &&
    hasVariantCombination(product, selectedOptions, variant?.id);
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      try {
        if (variant) {
          form.set(
            "variant_uploaded_images",
            JSON.stringify((await imagePicker.current?.prepare()) ?? []),
          );
        }
        const result = await editVariantAction(previous, form);
        notifyFeedback(result);
        if (result.status === "success") {
          unsaved.markSaved();
          editor?.close();
        }
        return result;
      } catch (error) {
        const result: MutationState = {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las imágenes. Inténtalo de nuevo.",
        };
        notifyFeedback(result);
        return result;
      } finally {
        editor?.setBusy(false);
      }
    },
    { status: "idle" },
  );
  if (!variant && !selectedOptions)
    return (
      <p className="text-sm text-muted-foreground">
        Ya están creadas todas las combinaciones disponibles. Para añadir otras,
        añade primero nuevos tamaños, colores u opciones.
      </p>
    );
  return (
    <form
      ref={formRef}
      action={action}
      onChangeCapture={unsaved.onChange}
      onSubmit={() => editor?.setBusy(true)}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="variant_id" value={variant?.id ?? ""} />
      {variant ? (
        <input
          type="hidden"
          name="variant_images"
          value={JSON.stringify(imageIds)}
        />
      ) : null}
      {variant ? (
        <input
          type="hidden"
          name="master_sku"
          value={variant.sku || defaultSku || ""}
        />
      ) : null}
      <fieldset
        disabled={isPending || state.status === "success"}
        className="grid gap-4 sm:grid-cols-2"
      >
        {variant && hasOptions ? (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${prefix}-title`}>
              Nombre de la variante
            </FieldLabel>
            <Input
              id={`${prefix}-title`}
              name="title"
              required
              maxLength={200}
              defaultValue={variant.title}
            />
          </Field>
        ) : (
          <input
            type="hidden"
            name="title"
            value={variant?.title || automaticTitle}
          />
        )}
        {(product.options ?? []).map((option, index) => {
          const value = selectedOptions?.[index] ?? "";
          if (option.title === "__default__") {
            return (
              <input
                key={option.id}
                type="hidden"
                name={`option_${index}`}
                value={value}
              />
            );
          }
          return (
            <Field key={option.id}>
              <FieldLabel htmlFor={`${prefix}-option-${index}`}>
                {option.title}
              </FieldLabel>
              <NativeSelect
                id={`${prefix}-option-${index}`}
                name={`option_${index}`}
                required
                value={value}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedOptions((current) =>
                    (current ?? []).map((entry, optionIndex) =>
                      optionIndex === index ? value : entry,
                    ),
                  );
                }}
                aria-describedby={
                  hasDuplicate ? `${prefix}-duplicate` : undefined
                }
              >
                <option value="" disabled>
                  Seleccionar valor
                </option>
                {option.values?.map((entry) => (
                  <option key={entry.id} value={entry.value}>
                    {entry.value === "__default__" ? "Única" : entry.value}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          );
        })}
        <div className="sm:col-span-2">
          <VariantSpecificationFields
            value={specifications}
            onChange={setSpecifications}
          />
        </div>
        {variant ? (
          <div className="sm:col-span-2">
            <VariantMediaFields
              images={media?.ownImages ?? []}
              generalImages={media?.generalImages ?? []}
              includeGeneralImages={(product.variants?.length ?? 0) <= 1}
              selected={imageIds}
              onChange={setImageIds}
              maxSelected={6 - uploadIds.length}
            >
              <ProductImages
                ref={imagePicker}
                scope="variant"
                disabled={isPending || state.status === "success"}
                maxImages={6 - imageIds.length}
                onImagesChange={setUploadIds}
                onBusyChange={(busy) => {
                  setValidatingImages(busy);
                  editor?.setBusy(busy);
                }}
              />
            </VariantMediaFields>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Después de crear la variante, puedes elegir sus imágenes desde
            Editar.
          </p>
        )}
        {hasDuplicate ? (
          <p
            id={`${prefix}-duplicate`}
            role="status"
            className="text-sm text-muted-foreground sm:col-span-2"
          >
            Esta combinación ya tiene una variante. Elige otros valores.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={hasDuplicate || isValidatingImages}>
            {isPending ? "Guardando…" : variant ? "Guardar" : "Crear variante"}
          </Button>
          {editor ? (
            <Button
              variant="ghost"
              onClick={() => unsaved.confirmDiscard(editor.close)}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="text-sm"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
