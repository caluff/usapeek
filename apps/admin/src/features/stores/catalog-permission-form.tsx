"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogPermissionMode } from "@usapeek/api/catalog-permission-contracts";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { withFeedbackToast } from "@/lib/feedback";
import { useAdminRefreshBlocker } from "@/features/realtime/auto-refresh";
import { updateCatalogPermissionAction } from "./actions";
import {
  CATALOG_PERMISSION_LABELS,
  parseCatalogReviewMode,
  type CatalogPermissionState,
} from "./helpers";

type PermissionRequest = {
  id: number;
  mode: CatalogPermissionMode;
  previousMode: CatalogPermissionMode;
};

export function CatalogPermissionForm({
  sellerId,
  sellerName,
  mode,
}: {
  sellerId: string;
  sellerName: string;
  mode: CatalogPermissionMode;
}) {
  const router = useRouter();
  const selectRef = useRef<HTMLSelectElement>(null);
  const requestIdRef = useRef(0);
  const [requested, setRequested] = useState<PermissionRequest | null>(null);
  const [state, action, isPending] = useActionState<
    { feedback: CatalogPermissionState; completedRequestId: number },
    PermissionRequest
  >(
    async (previous, request) => {
      const formData = new FormData();
      formData.set("mode", request.mode);
      const feedback = await withFeedbackToast(
        updateCatalogPermissionAction.bind(null, sellerId),
      )(previous.feedback, formData);
      return { feedback, completedRequestId: request.id };
    },
    { feedback: { status: "idle" }, completedRequestId: 0 },
  );
  // Close only when the action has settled and the select can receive focus.
  const isConfirming =
    requested !== null &&
    (isPending || state.completedRequestId !== requested.id);
  const hasFeedback = Boolean(state.feedback.message && !isConfirming);
  useAdminRefreshBlocker(isConfirming || isPending);
  const feedbackId = `catalog-permission-feedback-${sellerId}`;

  return (
    <div className="min-w-48 space-y-2" aria-busy={isPending}>
      <NativeSelect
        ref={selectRef}
        value={isConfirming && requested ? requested.mode : mode}
        aria-label={`Permiso de catálogo de ${sellerName}`}
        aria-describedby={hasFeedback ? feedbackId : undefined}
        disabled={isPending}
        onChange={(event) => {
          const nextMode = parseCatalogReviewMode(event.target.value);
          if (nextMode && nextMode !== mode && !isPending) {
            setRequested({
              id: ++requestIdRef.current,
              mode: nextMode,
              previousMode: mode,
            });
          }
        }}
        className="h-9"
      >
        {Object.entries(CATALOG_PERMISSION_LABELS).map(([value, label]) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!open) setRequested(null);
        }}
        title="¿Cambiar el permiso de catálogo?"
        description={
          <>
            El permiso de «{sellerName}» cambiará de{" "}
            {CATALOG_PERMISSION_LABELS[requested?.previousMode ?? mode]} a{" "}
            {requested ? CATALOG_PERMISSION_LABELS[requested.mode] : ""}.
            {requested?.mode === "authorized"
              ? " La tienda podrá añadir y editar productos sin aprobación."
              : " Los productos nuevos y sus cambios requerirán revisión del administrador."}
          </>
        }
        confirmLabel="Cambiar permiso"
        pendingLabel="Cambiando…"
        isPending={isPending}
        returnFocusRef={selectRef}
        onConfirm={() => {
          if (!requested || isPending) return;
          startTransition(() => action(requested));
        }}
      />
      {hasFeedback && (
        <p
          id={feedbackId}
          role={state.feedback.status === "error" ? "alert" : "status"}
          className={`max-w-80 text-xs ${state.feedback.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.feedback.message}
        </p>
      )}
      {state.feedback.status === "error" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => router.refresh()}
        >
          Actualizar estado
        </Button>
      )}
    </div>
  );
}
