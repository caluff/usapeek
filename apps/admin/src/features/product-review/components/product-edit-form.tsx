"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { HttpTypes } from "@medusajs/types";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminRefreshBlocker } from "@/features/realtime/auto-refresh";
import { notifyFeedback, withFeedbackToast } from "@/lib/feedback";
import { saveProductContentAction } from "../management-actions";
import type { ProductReviewState } from "../helpers";

export function ProductEditForm({
  product,
  updatedAt,
}: {
  product: Pick<
    HttpTypes.AdminProduct,
    "id" | "title" | "subtitle" | "description"
  >;
  updatedAt: string;
}) {
  const router = useRouter();
  const detailHref = `/dashboard/product-review/${encodeURIComponent(product.id)}`;
  const [isDirty, setIsDirty] = useState(false);
  const [state, action, isPending] = useActionState<
    ProductReviewState,
    FormData
  >(
    async (previous, formData) => {
      try {
        const result = await withFeedbackToast(
          saveProductContentAction.bind(null, product.id),
        )(previous, formData);
        if (result.status === "success") router.push(detailHref);
        return result;
      } catch {
        const result: ProductReviewState = {
          status: "error",
          message:
            "No se pudo confirmar lo guardado. Actualiza el producto antes de reintentar.",
        };
        notifyFeedback(result);
        return result;
      }
    },
    { status: "idle" },
  );
  useAdminRefreshBlocker(isDirty || isPending);

  return (
    <form
      action={action}
      onChange={() => setIsDirty(true)}
      className="space-y-5"
      aria-busy={isPending}
    >
      <input type="hidden" name="expected_updated_at" value={updatedAt} />
      <Field>
        <FieldLabel htmlFor="product-title">Nombre del producto</FieldLabel>
        <Input
          id="product-title"
          name="title"
          defaultValue={product.title}
          required
          maxLength={200}
          disabled={isPending}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="product-subtitle">
          Resumen breve (opcional)
        </FieldLabel>
        <Input
          id="product-subtitle"
          name="subtitle"
          defaultValue={product.subtitle ?? ""}
          maxLength={200}
          disabled={isPending}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="product-description">Descripción</FieldLabel>
        <Textarea
          id="product-description"
          name="description"
          defaultValue={product.description ?? ""}
          rows={7}
          maxLength={20_000}
          disabled={isPending}
        />
      </Field>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || !isDirty || !updatedAt}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => router.push(detailHref)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
