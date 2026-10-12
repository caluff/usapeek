"use client";

import { useRef, useState, useTransition, type RefObject } from "react";
import type { CatalogPermissionMode } from "@usapeek/api/catalog-permission-contracts";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SettingsOption } from "@/components/ui/settings-option";
import { useAdminRefreshBlocker } from "@/features/realtime/auto-refresh";
import { notifyFeedback, withFeedbackToast } from "@/lib/feedback";
import { updateCatalogPermissionAction } from "./actions";
import {
  CATALOG_PERMISSION_LABELS,
  parseCatalogReviewMode,
  type CatalogPermissionState,
} from "./helpers";

function PermissionExplanation() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          static
          className="min-h-11 px-0 text-sm font-medium text-foreground underline decoration-muted-foreground/50 decoration-dotted underline-offset-4"
          aria-label="Permiso de catálogo: cómo funciona"
        >
          Permiso de catálogo
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Permiso de catálogo</DialogTitle>
        </DialogHeader>
        <dl className="space-y-5 text-sm leading-6">
          <div>
            <dt className="font-medium">Supervisado</dt>
            <dd className="mt-1 text-muted-foreground">
              Los productos nuevos y sus cambios requieren revisión del
              administrador.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Autorizado</dt>
            <dd className="mt-1 text-muted-foreground">
              La tienda puede añadir y editar productos sin aprobación.
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogPermissionSettings({
  sellerId,
  sellerName,
  mode,
}: {
  sellerId: string;
  sellerName: string;
  mode: CatalogPermissionMode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isBlockedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  useAdminRefreshBlocker(isOpen);
  return (
    <div ref={containerRef}>
      <SettingsOption
        label="Permiso de catálogo"
        labelContent={<PermissionExplanation />}
        value={CATALOG_PERMISSION_LABELS[mode]}
        description={`Elige cómo se revisan los productos de ${sellerName}.`}
        open={isOpen}
        onOpenChange={(open) => {
          if (isBlockedRef.current) return;
          if (open)
            triggerRef.current =
              containerRef.current?.querySelector<HTMLButtonElement>(
                "[data-settings-option-trigger]",
              ) ?? null;
          setIsOpen(open);
        }}
      >
        {isOpen && (
          <PermissionEditor
            sellerId={sellerId}
            sellerName={sellerName}
            mode={mode}
            savedFocusRef={triggerRef}
            onBlockedChange={(blocked) => {
              isBlockedRef.current = blocked;
            }}
            onSaved={() => setIsOpen(false)}
            onCancel={() => {
              if (!isBlockedRef.current) setIsOpen(false);
            }}
          />
        )}
      </SettingsOption>
    </div>
  );
}

function PermissionEditor({
  sellerId,
  sellerName,
  mode,
  savedFocusRef,
  onBlockedChange,
  onSaved,
  onCancel,
}: {
  sellerId: string;
  sellerName: string;
  mode: CatalogPermissionMode;
  savedFocusRef: RefObject<HTMLButtonElement | null>;
  onBlockedChange: (blocked: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draftMode, setDraftMode] = useState(mode);
  const [isConfirming, setIsConfirming] = useState(false);
  const [feedback, setFeedback] = useState<CatalogPermissionState>({
    status: "idle",
  });
  const [isPending, startTransition] = useTransition();
  const isSavingRef = useRef(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const confirmationFocusRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <form
        className="space-y-5"
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (isSavingRef.current || draftMode === mode) return;
          confirmationFocusRef.current = saveRef.current;
          onBlockedChange(true);
          setIsConfirming(true);
        }}
      >
        <Field>
          <FieldLabel htmlFor={`catalog-mode-${sellerId}`}>
            Revisión de productos
          </FieldLabel>
          <NativeSelect
            id={`catalog-mode-${sellerId}`}
            value={draftMode}
            disabled={isPending}
            onChange={(event) => {
              const value = parseCatalogReviewMode(event.target.value);
              if (value) setDraftMode(value);
            }}
          >
            {Object.entries(CATALOG_PERMISSION_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-sm leading-6 text-muted-foreground">
            {draftMode === "authorized"
              ? "La tienda podrá añadir y editar productos sin aprobación."
              : "Los productos nuevos y sus cambios requerirán revisión del administrador."}
          </p>
        </Field>
        {feedback.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {feedback.message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            ref={saveRef}
            type="submit"
            disabled={isPending || draftMode === mode}
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      </form>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (isSavingRef.current) return;
          onBlockedChange(open);
          setIsConfirming(open);
        }}
        title="¿Cambiar el permiso de catálogo?"
        description={
          <>
            El permiso de «{sellerName}» cambiará de{" "}
            {CATALOG_PERMISSION_LABELS[mode]} a{" "}
            {CATALOG_PERMISSION_LABELS[draftMode]}.{" "}
            {draftMode === "authorized"
              ? "La tienda podrá añadir y editar productos sin aprobación."
              : "Los productos nuevos y sus cambios requerirán revisión del administrador."}
          </>
        }
        confirmLabel="Cambiar permiso"
        pendingLabel="Cambiando…"
        isPending={isPending}
        returnFocusRef={confirmationFocusRef}
        onConfirm={() => {
          if (isSavingRef.current || draftMode === mode) return;
          isSavingRef.current = true;
          onBlockedChange(true);
          startTransition(async () => {
            try {
              const formData = new FormData();
              formData.set("mode", draftMode);
              const result = await withFeedbackToast(
                updateCatalogPermissionAction.bind(null, sellerId),
              )({ status: "idle" }, formData);
              setFeedback(result);
              if (result.status === "success") {
                confirmationFocusRef.current = savedFocusRef.current;
                onSaved();
              }
            } catch {
              const result: CatalogPermissionState = {
                status: "error",
                message:
                  "No se pudo confirmar el permiso guardado. Actualiza la tienda antes de reintentar.",
              };
              setFeedback(result);
              notifyFeedback(result);
            } finally {
              isSavingRef.current = false;
              onBlockedChange(false);
              setIsConfirming(false);
            }
          });
        }}
      />
    </>
  );
}
