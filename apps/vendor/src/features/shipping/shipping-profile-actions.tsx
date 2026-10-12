"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Archive, ArchiveRestore, Ellipsis, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { useConfirmDiscardWithin } from "../workspace/unsaved-changes";
import { saveShippingAction } from "./actions";
import { ShippingForm } from "./shipping-form";

type ArchiveRequest = { id: number; archived: boolean };

export function ShippingProfileActions({
  profileId,
  name,
  archived,
}: {
  profileId: string;
  name: string;
  archived: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const confirmDiscardWithin = useConfirmDiscardWithin();
  const requestIdRef = useRef(0);
  const [isEditing, setIsEditing] = useState(false);
  const [requested, setRequested] = useState<ArchiveRequest | null>(null);
  const [state, action, isPending] = useActionState<
    { feedback: MutationState; completedRequestId: number },
    ArchiveRequest
  >(
    async (previous, request) => {
      const form = new FormData();
      form.set("action", "set_profile_archived");
      form.set("profile_id", profileId);
      form.set("archived", String(request.archived));
      const feedback = await saveShippingAction(previous.feedback, form);
      notifyFeedback(feedback);
      return { feedback, completedRequestId: request.id };
    },
    { feedback: { status: "idle" }, completedRequestId: 0 },
  );
  const isConfirming =
    requested !== null &&
    (isPending || state.completedRequestId !== requested.id);

  function closeEditor() {
    setIsEditing(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            aria-label={`Acciones de ${name}`}
            disabled={isPending}
          >
            <Ellipsis className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (isEditing || isConfirming) event.preventDefault();
            if (isEditing) nameInputRef.current?.focus();
          }}
        >
          <DropdownMenuItem onSelect={() => setIsEditing(true)}>
            <Pencil aria-hidden="true" />
            Editar nombre
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              confirmDiscardWithin(() => {
                setIsEditing(false);
                setRequested({
                  id: ++requestIdRef.current,
                  archived: !archived,
                });
              }, editorRef.current);
            }}
          >
            {archived ? (
              <ArchiveRestore aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            {archived ? "Restaurar perfil" : "Archivar perfil"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!open) setRequested(null);
        }}
        title={
          requested?.archived
            ? "¿Archivar este perfil?"
            : "¿Restaurar este perfil?"
        }
        description={
          requested?.archived
            ? `Los productos de «${name}» dejarán de ofrecer envío y recogida en nuevas compras. Los pedidos existentes se conservan. Puedes restaurar el perfil o asignar sus productos a otro.`
            : `Se recuperarán las tarifas activas de «${name}» y la recogida, si está habilitada para tu tienda.`
        }
        confirmLabel={
          requested?.archived ? "Archivar perfil" : "Restaurar perfil"
        }
        pendingLabel={requested?.archived ? "Archivando…" : "Restaurando…"}
        isPending={isPending}
        returnFocusRef={triggerRef}
        onConfirm={() => {
          if (!requested || isPending) return;
          startTransition(() => action(requested));
        }}
      />
      {isEditing ? (
        <div ref={editorRef} className="col-span-2 border-t py-4">
          <ShippingForm
            key={name}
            profileId={profileId}
            name={name}
            nameInputRef={nameInputRef}
            onSuccess={closeEditor}
            onCancel={closeEditor}
          />
        </div>
      ) : null}
      {state.feedback.status === "error" && !isConfirming ? (
        <p role="alert" className="col-span-2 pb-4 text-sm text-destructive">
          {state.feedback.message}
        </p>
      ) : null}
    </>
  );
}
