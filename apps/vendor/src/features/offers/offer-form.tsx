"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { ShippingProfileDTO } from "@medusajs/types";
import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import { savePresentationAction } from "./actions";
import {
  savePresentationAndStock,
  type PresentationStockSaveState,
} from "./save-presentation-stock";
import { updateStockAction } from "../workspace/actions";
import {
  ProductPriceField,
  ProductStockField,
} from "../catalog/product-price-stock-fields";
import {
  hasPresentationOptions,
  hasVariantCombination,
  variantOptionValues,
} from "../catalog/variant-options";
import { usePresentationEditor } from "../catalog/presentation-editor";
import { specificationDraft } from "../catalog/product-specifications";
import { VariantSpecificationFields } from "../catalog/variant-specification-fields";
import { VariantMediaFields } from "../catalog/variant-media-fields";
import { variantMediaGroups } from "../catalog/variant-media-groups";
import {
  ProductImages,
  type ProductImagesHandle,
} from "../catalog/product-images";
import { useUnsavedChanges } from "../workspace/unsaved-changes";
import {
  isShippingProfileArchived,
  shippingProfileName,
} from "../shipping/presentation";

export function OfferForm({
  variantId,
  product,
  variant,
  hasPending,
  masterSku,
  warehouseId,
  profiles,
  offer,
  inventory,
  defaultSku,
}: {
  variantId: string;
  product: ProductDTO;
  variant: ProductVariantDTO;
  hasPending: boolean;
  masterSku: string;
  warehouseId: string;
  profiles: ShippingProfileDTO[];
  offer?: {
    id: string;
    sku: string;
    amount: string;
    shippingProfileId: string;
  };
  defaultSku: string;
  inventory?: { id: string; stocked: number; reserved: number };
}) {
  const prefix = useId();
  const editor = usePresentationEditor();
  const hasOptions = hasPresentationOptions(product);
  const media = variantMediaGroups(product, variant);
  const imagePicker = useRef<ProductImagesHandle>(null);
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [isValidatingImages, setValidatingImages] = useState(false);
  const [title, setTitle] = useState(variant.title);
  const [selectedOptions, setSelectedOptions] = useState(() =>
    variantOptionValues(product, variant),
  );
  const [savedVariant, setSavedVariant] = useState({
    title: variant.title,
    options: variantOptionValues(product, variant),
    specifications: specificationDraft(variant),
    imageIds: (variant.images ?? []).map((image) => image.id),
    uploadIds: [] as string[],
  });
  const [selectedImages, setSelectedImages] = useState(() =>
    (variant.images ?? []).map((image) => image.id),
  );
  const [specifications, setSpecifications] = useState(() =>
    specificationDraft(variant),
  );
  const hasDuplicate = hasVariantCombination(
    product,
    selectedOptions,
    variant.id,
  );
  const changeVariant =
    !hasPending &&
    (title.trim() !== savedVariant.title ||
      JSON.stringify(selectedOptions) !==
        JSON.stringify(savedVariant.options) ||
      JSON.stringify(specifications) !==
        JSON.stringify(savedVariant.specifications) ||
      JSON.stringify(selectedImages) !==
        JSON.stringify(savedVariant.imageIds) ||
      JSON.stringify(uploadIds) !== JSON.stringify(savedVariant.uploadIds));
  const [amount, setAmount] = useState(offer?.amount ?? "");
  const [sku] = useState(offer?.sku || defaultSku);
  const [stock, setStock] = useState(
    inventory ? String(inventory.stocked) : "0",
  );
  const [savedStock, setSavedStock] = useState(inventory?.stocked ?? 0);
  const changeStock = Boolean(
    offer && inventory && Number(stock) !== savedStock,
  );
  const [shippingProfileId, setShippingProfileId] = useState(
    offer?.shippingProfileId ?? "",
  );
  const [savedValues, setSavedValues] = useState({
    amount: offer?.amount ?? "",
    sku: offer?.sku ?? defaultSku,
    shippingProfileId: offer?.shippingProfileId ?? "",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const draft = {
    title: title.trim(),
    options: selectedOptions,
    specifications,
    imageIds: selectedImages,
    uploadIds,
    amount: amount === "" ? "" : String(Number(amount)),
    stock: String(Number(stock)),
    shippingProfileId,
  };
  const [savedDraft, setSavedDraft] = useState(draft);
  const unsaved = useUnsavedChanges(
    JSON.stringify(draft) !== JSON.stringify(savedDraft),
    formRef,
  );
  const [state, action, isPending] = useActionState(
    async (previous: PresentationStockSaveState, form: FormData) => {
      try {
        if (form.get("change_variant") === "true") {
          form.set(
            "variant_uploaded_images",
            JSON.stringify((await imagePicker.current?.prepare()) ?? []),
          );
        }
        const result = await savePresentationAndStock(
          form,
          {
            presentation: (data) => savePresentationAction(previous, data),
            stock: (data) => updateStockAction({ status: "idle" }, data),
          },
          inventory
            ? {
                id: inventory.id,
                locationId: warehouseId,
                expected: savedStock,
                reserved: inventory.reserved,
              }
            : undefined,
        );
        if (result.savedVariant) {
          setSavedVariant({
            title: title.trim(),
            options: [...selectedOptions],
            specifications: { ...specifications },
            imageIds: [...selectedImages],
            uploadIds: [...uploadIds],
          });
          setSavedDraft((previousDraft) => ({
            ...previousDraft,
            title: draft.title,
            options: [...draft.options],
            specifications: { ...draft.specifications },
            imageIds: [...draft.imageIds],
            uploadIds: [...draft.uploadIds],
          }));
        }
        if (result.savedOffer) {
          setSavedValues({
            amount: String(Number(form.get("amount"))),
            sku: String(form.get("offer_sku") ?? "").trim(),
            shippingProfileId: String(form.get("shipping_profile_id") ?? ""),
          });
          setSavedDraft((previousDraft) => ({
            ...previousDraft,
            amount: draft.amount,
            ...(!offer ? { stock: draft.stock } : {}),
            shippingProfileId: draft.shippingProfileId,
          }));
        }
        if (result.savedStock) {
          setSavedStock(Number(form.get("stocked_quantity")));
          setSavedDraft((previousDraft) => ({
            ...previousDraft,
            stock: draft.stock,
          }));
        }
        notifyFeedback(result);
        if (result.status === "success") {
          unsaved.markSaved();
          editor?.close();
        }
        return result;
      } catch (error) {
        const result: PresentationStockSaveState = {
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
  const changeOffer =
    !offer ||
    Number(amount) !== Number(savedValues.amount) ||
    shippingProfileId !== savedValues.shippingProfileId;
  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => editor?.setBusy(true)}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !isPending &&
          !isValidatingImages &&
          editor
        ) {
          event.preventDefault();
          event.stopPropagation();
          unsaved.confirmDiscard(editor.close);
        }
      }}
      className="space-y-6"
      aria-busy={isPending}
    >
      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="master_sku" value={masterSku} />
      <input
        type="hidden"
        name="variant_images"
        value={JSON.stringify(selectedImages)}
      />
      <input
        type="hidden"
        name="change_variant"
        value={String(changeVariant)}
      />
      <input type="hidden" name="change_offer" value={String(changeOffer)} />
      <input type="hidden" name="change_stock" value={String(changeStock)} />
      <input type="hidden" name="offer_sku" value={sku} />
      <input type="hidden" name="location_id" value={warehouseId} />
      {offer ? (
        <>
          <input type="hidden" name="offer_id" value={offer.id} />
          <input
            type="hidden"
            name="expected_amount"
            value={savedValues.amount}
          />
          <input type="hidden" name="expected_sku" value={savedValues.sku} />
          <input
            type="hidden"
            name="expected_shipping_profile_id"
            value={savedValues.shippingProfileId}
          />
        </>
      ) : null}
      <fieldset
        disabled={isPending}
        className="grid items-start gap-6 sm:grid-cols-3"
      >
        {hasOptions ? (
          <fieldset
            disabled={hasPending}
            className="col-span-full grid gap-4 sm:grid-cols-2"
          >
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={`${prefix}-title`}>
                Nombre de la variante
              </FieldLabel>
              <Input
                id={`${prefix}-title`}
                name="title"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            {(product.options ?? []).map((option, index) =>
              option.title === "__default__" ? (
                <input
                  key={option.id}
                  type="hidden"
                  name={`option_${index}`}
                  value={selectedOptions[index] ?? ""}
                />
              ) : (
                <Field key={option.id}>
                  <FieldLabel htmlFor={`${prefix}-option-${index}`}>
                    {option.title}
                  </FieldLabel>
                  <NativeSelect
                    id={`${prefix}-option-${index}`}
                    name={`option_${index}`}
                    required
                    value={selectedOptions[index] ?? ""}
                    aria-describedby={
                      hasDuplicate ? `${prefix}-duplicate` : undefined
                    }
                    onChange={(event) =>
                      setSelectedOptions((current) =>
                        current.map((value, at) =>
                          at === index ? event.target.value : value,
                        ),
                      )
                    }
                  >
                    <option value="" disabled>
                      Seleccionar valor
                    </option>
                    {option.values?.map((value) => (
                      <option key={value.id} value={value.value}>
                        {value.value}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ),
            )}
          </fieldset>
        ) : (
          <>
            <input type="hidden" name="title" value={title} />
            {(product.options ?? []).map((option, index) => (
              <input
                key={option.id}
                type="hidden"
                name={`option_${index}`}
                value={selectedOptions[index] ?? ""}
              />
            ))}
          </>
        )}
        {hasDuplicate ? (
          <p
            id={`${prefix}-duplicate`}
            role="status"
            className="text-sm text-muted-foreground col-span-full"
          >
            Esta combinación ya tiene una variante. Elige otros valores.
          </p>
        ) : null}
        <fieldset className="col-span-full grid items-start gap-4 sm:grid-cols-3">
          <legend className="mb-3 text-sm font-semibold">
            Venta e inventario
          </legend>
          <div className="space-y-2">
            <ProductPriceField
              name="amount"
              value={amount}
              onChange={setAmount}
            />
            <FieldDescription>Antes de impuestos.</FieldDescription>
          </div>
          {!offer || inventory ? (
            <div className="space-y-2">
              <ProductStockField
                name="stocked_quantity"
                value={stock}
                onChange={setStock}
                minimum={inventory?.reserved ?? 0}
              />
              {inventory ? (
                <FieldDescription>
                  {inventory.reserved > 0
                    ? `Incluye ${inventory.reserved} unidades reservadas.`
                    : "Unidades totales en el almacén."}
                </FieldDescription>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Las existencias necesitan revisión. Consulta el inventario.
            </p>
          )}
          <Field>
            <FieldLabel htmlFor={`${prefix}-profile`}>
              Perfil de envío *
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-profile`}
              name="shipping_profile_id"
              required
              value={shippingProfileId}
              onChange={(event) => setShippingProfileId(event.target.value)}
            >
              <option value="" disabled>
                Seleccionar perfil
              </option>
              {profiles
                .filter(
                  (profile) =>
                    !isShippingProfileArchived(profile) ||
                    profile.id === offer?.shippingProfileId,
                )
                .map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {shippingProfileName(profile)}
                    {isShippingProfileArchived(profile) ? " (archivado)" : ""}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </fieldset>
        <fieldset disabled={hasPending} className="col-span-full border-t pt-5">
          <VariantSpecificationFields
            value={specifications}
            onChange={setSpecifications}
          />
        </fieldset>
        <fieldset disabled={hasPending} className="col-span-full border-t pt-5">
          <VariantMediaFields
            images={media.ownImages}
            generalImages={media.generalImages}
            includeGeneralImages={(product.variants?.length ?? 0) <= 1}
            selected={selectedImages}
            onChange={setSelectedImages}
            maxSelected={6 - uploadIds.length}
          >
            <ProductImages
              ref={imagePicker}
              scope="variant"
              disabled={isPending || hasPending}
              maxImages={6 - selectedImages.length}
              onImagesChange={setUploadIds}
              onBusyChange={(busy) => {
                setValidatingImages(busy);
                editor?.setBusy(busy);
              }}
            />
          </VariantMediaFields>
        </fieldset>
        <div className="col-span-full flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            type="submit"
            disabled={
              isValidatingImages ||
              hasDuplicate ||
              (!changeVariant && !changeOffer && !changeStock)
            }
          >
            {isPending ? "Guardando…" : "Guardar"}
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
      {state.status === "error" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="rounded-lg border p-3 text-sm"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
