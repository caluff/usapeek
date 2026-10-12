"use client";

import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
} from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { saveShippingAction } from "./actions";

type PickupRequest = { id: number; enabled: boolean };

export function PickupForm({ enabled }: { enabled: boolean }) {
  const id = useId();
  const checkboxRef = useRef<HTMLButtonElement>(null);
  const requestIdRef = useRef(0);
  const [requested, setRequested] = useState<PickupRequest | null>(null);
  const [state, action, isPending] = useActionState<
    { feedback: MutationState; completedRequestId: number },
    PickupRequest
  >(
    async (previous, request) => {
      const form = new FormData();
      form.set("action", "set_pickup");
      form.set("enabled", String(request.enabled));
      const feedback = await saveShippingAction(previous.feedback, form);
      notifyFeedback(feedback);
      return { feedback, completedRequestId: request.id };
    },
    { feedback: { status: "idle" }, completedRequestId: 0 },
  );
  const isConfirming =
    requested !== null &&
    (isPending || state.completedRequestId !== requested.id);

  return (
    <div className="space-y-4" aria-busy={isPending}>
      <div className="flex items-start gap-3">
        <Checkbox
          ref={checkboxRef}
          id={id}
          checked={enabled}
          disabled={isPending}
          onCheckedChange={(checked) => {
            if (checked === "indeterminate" || checked === enabled || isPending)
              return;
            setRequested({ id: ++requestIdRef.current, enabled: checked });
          }}
          aria-describedby={`${id}-help`}
          className="mt-1"
        />
        <div className="space-y-1">
          <FieldLabel htmlFor={id} className="min-h-6 cursor-pointer">
            Permitir recogida en tienda
          </FieldLabel>
          <FieldDescription id={`${id}-help`}>
            Sin costo, para los perfiles de envío activos.
          </FieldDescription>
        </div>
      </div>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!open) setRequested(null);
        }}
        title={
          requested?.enabled
            ? "¿Activar la recogida en tienda?"
            : "¿Desactivar la recogida en tienda?"
        }
        description={
          requested?.enabled
            ? "Tus compradores podrán recoger sus productos en tu tienda sin costo, en los perfiles de envío activos."
            : "La recogida en tienda dejará de estar disponible para nuevas compras."
        }
        confirmLabel="Aceptar"
        pendingLabel="Guardando…"
        isPending={isPending}
        returnFocusRef={checkboxRef}
        onConfirm={() => {
          if (!requested || isPending) return;
          startTransition(() => action(requested));
        }}
      />
      {state.feedback.status === "error" && !isConfirming ? (
        <p role="alert" className="text-sm text-destructive">
          {state.feedback.message}
        </p>
      ) : null}
    </div>
  );
}
