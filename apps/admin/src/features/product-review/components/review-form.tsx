"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notifyFeedback, withFeedbackToast } from "@/lib/feedback";
import { reviewProductAction } from "../actions";
import {
  parseProductReviewDecision,
  type ProductReviewDecision,
  type ProductReviewState,
} from "../helpers";

const LABELS: Record<ProductReviewDecision, string> = {
  publish: "Publicar producto",
  request_changes: "Solicitar correcciones",
  reject: "Rechazar producto",
  confirm_change: "Aplicar cambios pendientes",
  cancel_change: "Descartar cambios pendientes",
};

export function ProductModerationForm({
  productId,
  updatedAt,
  changeId,
  onPendingChange,
  onSuccess,
  onCancel,
}: {
  productId: string;
  updatedAt: string;
  changeId?: string;
  onPendingChange?: (isPending: boolean) => void;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<ProductReviewDecision>(
    changeId ? "confirm_change" : "publish",
  );
  const [state, action, isPending] = useActionState<
    ProductReviewState,
    FormData
  >(
    async (previous, formData) => {
      onPendingChange?.(true);
      try {
        const result = await withFeedbackToast(
          reviewProductAction.bind(null, productId),
        )(previous, formData);
        if (result.status === "success") {
          onSuccess?.();
          router.refresh();
        }
        return result;
      } catch {
        const result: ProductReviewState = {
          status: "error",
          message:
            "No se pudo confirmar la decisión. Actualiza el producto antes de reintentar.",
        };
        notifyFeedback(result);
        return result;
      } finally {
        onPendingChange?.(false);
      }
    },
    { status: "idle" },
  );
  const isPublicReason =
    decision === "reject" || decision === "request_changes";
  return (
    <form action={action} className="space-y-4" aria-busy={isPending}>
      <input type="hidden" name="expected_updated_at" value={updatedAt} />
      {changeId && <input type="hidden" name="change_id" value={changeId} />}
      <Field>
        <FieldLabel htmlFor={`decision-${changeId ?? productId}`}>
          Decisión
        </FieldLabel>
        <NativeSelect
          id={`decision-${changeId ?? productId}`}
          name="decision"
          value={decision}
          disabled={isPending || state.status === "success"}
          onChange={(event) => {
            const parsed = parseProductReviewDecision(event.target.value);
            if (parsed) setDecision(parsed);
          }}
        >
          {(changeId
            ? (["confirm_change", "cancel_change"] as const)
            : (["publish", "request_changes", "reject"] as const)
          ).map((value) => (
            <NativeSelectOption key={value} value={value}>
              {LABELS[value]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription>
          {changeId
            ? "Esta operación resuelve la revisión pendiente seleccionada. Descartarla no elimina el producto actual."
            : "Publicar hace visible el producto en el catálogo. Una oferta, stock y logística válidos siguen siendo necesarios para venderlo."}
        </FieldDescription>
      </Field>
      {decision !== "cancel_change" && (
        <Field>
          <FieldLabel htmlFor={`note-${changeId ?? productId}`}>
            {isPublicReason
              ? "Motivo para el vendedor"
              : "Nota interna (opcional)"}
          </FieldLabel>
          <Textarea
            id={`note-${changeId ?? productId}`}
            name="note"
            required={isPublicReason}
            minLength={isPublicReason ? 10 : undefined}
            maxLength={2000}
            disabled={isPending || state.status === "success"}
          />
          <FieldDescription>
            {isPublicReason
              ? "El vendedor podrá leer este motivo."
              : "Esta nota queda en el registro administrativo."}
          </FieldDescription>
        </Field>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={isPending || state.status === "success"}
          variant={
            decision === "reject" || decision === "cancel_change"
              ? "destructive"
              : "default"
          }
        >
          {isPending && (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          )}
          {isPending ? "Guardando…" : LABELS[decision]}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => (onCancel ? onCancel() : router.refresh())}
        >
          {onCancel ? "Cancelar" : "Actualizar estado"}
        </Button>
      </div>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
