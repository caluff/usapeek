"use client";

import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
} from "react";
import type { ShippingProfileDTO } from "@medusajs/types";
import type { ProductDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import { shippingProfileName } from "../shipping/presentation";
import type { MutationState } from "../workspace/presentation";
import { useFormUnsavedChanges } from "../workspace/unsaved-changes";
import { createVariantAction } from "./actions";
import { usePresentationEditor } from "./presentation-editor";
import { ProductImages, type ProductImagesHandle } from "./product-images";
import {
  ProductPriceField,
  ProductStockField,
} from "./product-price-stock-fields";
import { specificationDraft } from "./product-specifications";
import { VariantSpecificationFields } from "./variant-specification-fields";
import { VariantMediaFields } from "./variant-media-fields";
import {
  hasVariantCombination,
  newVariantOptionDraft,
} from "./variant-options";

const NEW_VALUE = "__new_variant_option_value__";

export function CreateVariantForm({
  product,
  profiles,
}: {
  product: ProductDTO;
  profiles: ShippingProfileDTO[];
}) {
  const prefix = useId();
  const editor = usePresentationEditor();
  const formRef = useRef<HTMLFormElement>(null);
  const imagePicker = useRef<ProductImagesHandle>(null);
  const [options, setOptions] = useState(() => newVariantOptionDraft(product));
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [stock, setStock] = useState("0");
  const [profile, setProfile] = useState("");
  const [specifications, setSpecifications] = useState(specificationDraft);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [isValidatingImages, setValidatingImages] = useState(false);
  const selected = options.map(({ value }) => value.trim());
  const hasDuplicate = hasVariantCombination(product, selected);
  const title =
    titleOverride ??
    selected
      .filter((value) => value !== "__default__")
      .join(" / ")
      .slice(0, 200);
  const unsaved = useFormUnsavedChanges(
    formRef,
    JSON.stringify({
      options,
      titleOverride,
      amount,
      stock,
      profile,
      specifications,
      imageIds,
      uploadIds,
    }),
  );
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      try {
        if (imageIds.length + uploadIds.length > 6)
          throw new Error(
            "Selecciona hasta 6 imágenes propias para la variante.",
          );
        if (!imagePicker.current)
          throw new Error(
            "No se pudieron preparar las imágenes. Inténtalo de nuevo.",
          );
        form.set(
          "variant_uploaded_images",
          JSON.stringify(await imagePicker.current.prepare()),
        );
        const result = await createVariantAction(previous, form);
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
              : "No se pudo crear la variante. Inténtalo de nuevo.",
        };
        notifyFeedback(result);
        return result;
      } finally {
        editor?.setBusy(false);
      }
    },
    { status: "idle" },
  );
  const isDisabled =
    isPending || isValidatingImages || state.status === "success";

  function updateOption(index: number, next: (typeof options)[number]) {
    setOptions((current) =>
      current.map((entry, at) => (at === index ? next : entry)),
    );
  }

  return (
    <form
      ref={formRef}
      onChangeCapture={unsaved.onChange}
      onSubmit={(event) => {
        event.preventDefault();
        if (isDisabled || isValidatingImages || hasDuplicate) return;
        const form = new FormData(event.currentTarget);
        editor?.setBusy(true);
        startTransition(() => action(form));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={product.id} />
      <input
        type="hidden"
        name="variant_images"
        value={JSON.stringify(imageIds)}
      />
      <fieldset disabled={isDisabled} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {(product.options ?? []).map((option, index) => {
            const draft = options[index];
            return (
              <div key={option.id} className="space-y-3">
                <input
                  type="hidden"
                  name={`option_${index}`}
                  value={selected[index]}
                />
                {option.title !== "__default__" ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor={`${prefix}-option-${index}`}>
                        {option.title} *
                      </FieldLabel>
                      <NativeSelect
                        id={`${prefix}-option-${index}`}
                        value={draft.isNew ? NEW_VALUE : draft.value}
                        onChange={(event) =>
                          updateOption(index, {
                            isNew: event.target.value === NEW_VALUE,
                            value:
                              event.target.value === NEW_VALUE
                                ? ""
                                : event.target.value,
                          })
                        }
                        required
                      >
                        {(option.values ?? []).map((entry) => (
                          <option key={entry.id} value={entry.value}>
                            {entry.value}
                          </option>
                        ))}
                        <option value={NEW_VALUE}>Añadir otro valor…</option>
                      </NativeSelect>
                    </Field>
                    {draft.isNew ? (
                      <Field>
                        <FieldLabel htmlFor={`${prefix}-new-${index}`}>
                          Nuevo valor de {option.title.toLowerCase()} *
                        </FieldLabel>
                        <Input
                          id={`${prefix}-new-${index}`}
                          value={draft.value}
                          onChange={(event) =>
                            updateOption(index, {
                              isNew: true,
                              value: event.target.value,
                            })
                          }
                          required
                          maxLength={200}
                        />
                      </Field>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
          <Field>
            <FieldLabel htmlFor={`${prefix}-title`}>
              Nombre de la variante *
            </FieldLabel>
            <Input
              id={`${prefix}-title`}
              name="title"
              value={title}
              onChange={(event) => setTitleOverride(event.target.value)}
              required
              maxLength={200}
            />
          </Field>
          {hasDuplicate ? (
            <p role="status" className="text-sm text-destructive sm:col-span-2">
              Esta combinación ya tiene una variante. Elige otro valor.
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ProductPriceField
            name="amount"
            value={amount}
            onChange={setAmount}
          />
          <ProductStockField
            name="stocked_quantity"
            value={stock}
            onChange={setStock}
          />
          <Field>
            <FieldLabel htmlFor={`${prefix}-profile`}>
              Perfil de envío *
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-profile`}
              name="shipping_profile_id"
              required
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
            >
              <option value="" disabled>
                Seleccionar perfil
              </option>
              {profiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {shippingProfileName(entry)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="border-t pt-5">
          <VariantSpecificationFields
            value={specifications}
            onChange={setSpecifications}
          />
        </div>
        <div className="border-t pt-5">
          <VariantMediaFields
            images={product.images ?? []}
            selected={imageIds}
            onChange={setImageIds}
            maxSelected={6 - uploadIds.length}
          >
            <ProductImages
              ref={imagePicker}
              scope="variant"
              requiresImage={false}
              disabled={isDisabled}
              maxImages={6 - imageIds.length}
              onImagesChange={setUploadIds}
              onBusyChange={(busy) => {
                setValidatingImages(busy);
                editor?.setBusy(busy);
              }}
            />
          </VariantMediaFields>
        </div>
        <p className="text-sm text-muted-foreground">
          La variante, su precio y sus existencias se activan cuando se apruebe
          la solicitud.
        </p>
        {state.message && state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => editor && unsaved.confirmDiscard(editor.close)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={hasDuplicate || isValidatingImages}>
            {isPending ? "Guardando…" : "Crear variante"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
