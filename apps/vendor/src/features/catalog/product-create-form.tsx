"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductImageDTO } from "@medusajs/types";
import { Button } from "@/components/ui/button";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { useFormUnsavedChanges } from "../workspace/unsaved-changes";
import type { CatalogAxis, CatalogVariant } from "./validation";
import { ProductImages, type ProductImagesHandle } from "./product-images";
import { ProductDetailsFields } from "./product-details-fields";
import { ProductOptionsFields } from "./product-options-fields";
import { ProductCreateVariants } from "./product-create-variants";
import { ProductCategoryGroup } from "./product-category-group";
import type { ProductFormProps } from "./product-form-types";
import {
  createVariantDrafts,
  parseCatalogOptions,
  singleVariantDraft,
  type CatalogOptionDraft,
} from "./product-create-draft";

const CREATE_STEPS = ["Detalles", "Organización", "Variantes"];

export function ProductCreateForm({
  action,
  categories,
  organization,
  commercialConfiguration,
  disabled = false,
}: ProductFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const imagePicker = useRef<ProductImagesHandle>(null);
  const sections = useRef<(HTMLDivElement | null)[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [axes, setAxes] = useState<CatalogOptionDraft[]>([]);
  const [generatedAxes, setGeneratedAxes] = useState<CatalogAxis[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<CatalogVariant[]>([]);
  const [singleVariant, setSingleVariant] = useState(() =>
    singleVariantDraft(),
  );
  const [images, setImages] = useState<Pick<ProductImageDTO, "id" | "url">[]>(
    [],
  );
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const variants = hasVariants ? variantDrafts : [singleVariant];
  const unsaved = useFormUnsavedChanges(
    formRef,
    JSON.stringify({ hasVariants, axes, variantDrafts, singleVariant, images }),
  );
  const [state, formAction, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      try {
        if (!imagePicker.current)
          throw new Error("Espera a que carguen las imágenes.");
        form.set("images", JSON.stringify(await imagePicker.current.prepare()));
        const result = await action(previous, form);
        notifyFeedback(result);
        if (result.status === "success") {
          unsaved.markSaved();
          if (result.href) router.replace(result.href);
        }
        return result;
      } catch (error) {
        const result: MutationState = {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo guardar el producto.",
        };
        notifyFeedback(result);
        return result;
      }
    },
    { status: "idle" },
  );
  function goToStep(next: number) {
    setStep(next);
    setStepError("");
    requestAnimationFrame(() =>
      sections.current[next]?.querySelector<HTMLElement>("h2")?.focus(),
    );
  }
  function failStep(index: number, message: string) {
    goToStep(index);
    setStepError(message);
    return false;
  }
  function validateStep(index: number) {
    const fields = sections.current[index]?.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select");
    const invalid = Array.from(fields ?? []).find(
      (field) => field.willValidate && !field.validity.valid,
    );
    if (invalid) {
      goToStep(index);
      requestAnimationFrame(() => {
        let parent = invalid.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        invalid.reportValidity();
      });
      return false;
    }
    if (index === 0) {
      if (
        !formRef.current ||
        !new FormData(formRef.current).get("title")?.toString().trim()
      )
        return failStep(0, "Escribe el nombre del producto.");
      if (!images.length)
        return failStep(
          0,
          "Añade al menos una imagen del producto para continuar.",
        );
      if (hasVariants)
        try {
          createVariantDrafts(parseCatalogOptions(axes), variantDrafts);
        } catch (error) {
          return failStep(
            0,
            error instanceof Error ? error.message : "Revisa las opciones.",
          );
        }
    }
    if (
      index === 1 &&
      !formRef.current?.querySelector('[name="categories_present"]')
    )
      return failStep(
        1,
        "Espera a que carguen las categorías. Si aparece un error, vuelve a intentarlo.",
      );
    if (
      index === 2 &&
      !formRef.current?.querySelector('[name="initial_offers_present"]')
    )
      return failStep(
        2,
        "Espera a que cargue la configuración de venta o completa el almacén y los envíos de tu tienda.",
      );
    return true;
  }
  function navigateStep(next: number) {
    if (next > step) {
      if (
        !Array.from({ length: next }, (_, index) => index).every(validateStep)
      )
        return;
      const parsed = hasVariants ? parseCatalogOptions(axes) : [];
      if (hasVariants)
        setVariantDrafts(createVariantDrafts(parsed, variantDrafts));
      else if (formRef.current) {
        const title = new FormData(formRef.current)
          .get("title")
          ?.toString()
          .trim();
        setSingleVariant((current) => ({
          ...current,
          title: title ?? "",
        }));
      }
      setGeneratedAxes(parsed);
    }
    setFurthestStep((current) => Math.max(current, next));
    goToStep(next);
  }
  function nextStep() {
    navigateStep(step + 1);
  }
  return (
    <form
      ref={formRef}
      noValidate
      onChangeCapture={unsaved.onChange}
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          disabled ||
          isPending ||
          isUploadingImages ||
          state.status === "success"
        ) {
          return;
        }
        if (step < 2) {
          nextStep();
          return;
        }
        if (![0, 1, 2].every(validateStep)) return;
        const form = new FormData(event.currentTarget);
        // A returned error also resolves a form action and resets Radix controls.
        // Dispatch explicitly so failed submissions preserve the entire draft.
        startTransition(() => formAction(form));
      }}
      className="min-w-0"
    >
      <input type="hidden" name="status" value="proposed" />
      <input
        type="hidden"
        name="axes"
        value={JSON.stringify(hasVariants ? generatedAxes : [])}
      />
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          variants.map((variant) => ({
            title: variant.title,
            options: variant.options,
            specifications: variant.specifications,
            amount: variant.amount,
            stockedQuantity: variant.stockedQuantity,
            imageIndexes: hasVariants ? variant.imageIndexes : undefined,
          })),
        )}
      />
      <fieldset
        disabled={disabled || isPending || state.status === "success"}
        className="min-w-0"
      >
        <nav
          aria-label="Pasos para crear un producto"
          className="border-b px-4 sm:px-6"
        >
          <ol className="flex gap-4 sm:gap-8">
            {CREATE_STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={step === index ? "step" : undefined}
                  disabled={isUploadingImages || index > furthestStep}
                  onClick={() => navigateStep(index)}
                  className={`flex min-h-14 items-center gap-2 border-b-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${step === index ? "border-brand-accent text-foreground" : "border-transparent text-muted-foreground"}`}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          <div
            ref={(element) => {
              sections.current[0] = element;
            }}
            hidden={step !== 0}
            className="mx-auto max-w-3xl space-y-6"
          >
            <h2 tabIndex={-1} className="text-lg font-semibold outline-none">
              Detalles del producto
            </h2>
            <ProductDetailsFields
              onTitleChange={(title) =>
                setSingleVariant((current) => ({
                  ...current,
                  title: title.trim(),
                }))
              }
            />
            <ProductImages
              ref={imagePicker}
              disabled={disabled || isPending}
              onBusyChange={setIsUploadingImages}
              onMediaChange={(next) => {
                const remap = (variant: CatalogVariant) => ({
                  ...variant,
                  imageIndexes: (variant.imageIndexes ?? [])
                    .map((at) =>
                      next.findIndex((image) => image.id === images[at]?.id),
                    )
                    .filter((at) => at >= 0),
                });
                setVariantDrafts((current) => current.map(remap));
                setSingleVariant((current) => remap(current));
                setImages(next);
                setStepError("");
              }}
            />
            <ProductOptionsFields
              hasVariants={hasVariants}
              options={axes}
              onModeChange={(value) => {
                setHasVariants(value);
                if (value && !axes.length) setAxes([{ title: "", values: "" }]);
                setStepError("");
              }}
              onOptionsChange={(value) => {
                setAxes(value);
                setStepError("");
              }}
            />
          </div>
          <div
            ref={(element) => {
              sections.current[1] = element;
            }}
            hidden={step !== 1}
            className="mx-auto max-w-3xl space-y-6"
          >
            <h2 tabIndex={-1} className="text-lg font-semibold outline-none">
              Organización
            </h2>
            {organization}
            <ProductCategoryGroup>{categories}</ProductCategoryGroup>
          </div>
          <div
            ref={(element) => {
              sections.current[2] = element;
            }}
            hidden={step !== 2}
            className="space-y-5"
          >
            <h2
              tabIndex={-1}
              className={
                hasVariants
                  ? "text-lg font-semibold outline-none"
                  : "sr-only outline-none"
              }
            >
              {hasVariants ? `Variantes (${variants.length})` : "Variantes"}
            </h2>
            {commercialConfiguration}
            <ProductCreateVariants
              isSingleVariant={!hasVariants}
              variants={variants}
              images={images}
              onChange={(next) => {
                if (hasVariants) setVariantDrafts(next);
                else setSingleVariant(next[0]);
              }}
            />
            <p className="text-sm text-muted-foreground">
              El precio y las existencias se guardan con el producto. Mientras
              esté pendiente de aprobación, no estará disponible para comprar.
            </p>
          </div>
          {stepError ? (
            <p role="alert" className="mt-5 text-sm text-destructive">
              {stepError}
            </p>
          ) : null}
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-4 sm:px-6">
          <span className="text-xs text-muted-foreground">
            Paso {step + 1} de {CREATE_STEPS.length}
          </span>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={isUploadingImages}
                onClick={() => goToStep(step - 1)}
              >
                Anterior
              </Button>
            ) : null}
            {step < 2 ? (
              <Button
                key="continue"
                type="button"
                disabled={isUploadingImages}
                onClick={(event) => {
                  event.preventDefault();
                  nextStep();
                }}
              >
                Continuar
              </Button>
            ) : (
              <Button key="save" type="submit" disabled={isUploadingImages}>
                {isPending ? "Guardando…" : "Guardar producto"}
              </Button>
            )}
          </div>
        </div>
      </fieldset>
      {state.status === "error" && state.message ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
