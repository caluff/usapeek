"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { orderAction } from "./actions";
import type { OrderActionState } from "./helpers";

export function OrderActionForm({
  id,
  operation,
  fulfillmentId,
  allowed = true,
}: {
  id: string;
  operation: "complete" | "deliver" | "cancel_fulfillment";
  fulfillmentId?: string;
  allowed?: boolean;
}) {
  const [state, setState] = useState<OrderActionState>({
    status: "idle",
    message: "",
  });
  const [isConfirming, setIsConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef<FormData | null>(null);
  const isSavingRef = useRef(false);
  if (!allowed && state.status !== "success" && !pending && !isConfirming)
    return null;
  const label =
    operation === "complete"
      ? "Completar pedido"
      : operation === "deliver"
        ? "Marcar como entregado"
        : "Cancelar preparación";
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            isSavingRef.current ||
            isConfirming ||
            state.status === "success" ||
            !allowed
          )
            return;
          submittedRef.current = new FormData(event.currentTarget);
          submittedRef.current.set("confirmed", "yes");
          setIsConfirming(true);
        }}
        className="space-y-3 rounded-lg border border-border p-4"
      >
        <input type="hidden" name="order_id" value={id} />
        <input type="hidden" name="operation" value={operation} />
        {fulfillmentId && (
          <input type="hidden" name="fulfillment_id" value={fulfillmentId} />
        )}
        <Button
          ref={buttonRef}
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending || isConfirming}
          aria-disabled={state.status === "success" || !allowed}
        >
          {pending ? "Actualizando…" : label}
        </Button>
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className="text-sm"
          >
            {state.message}
          </p>
        )}
      </form>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!isSavingRef.current) setIsConfirming(open);
        }}
        title={label}
        description={
          operation === "complete"
            ? "Confirma que todos los artículos fueron entregados y la gestión del pedido terminó."
            : operation === "deliver"
              ? "Confirma que el comprador recibió los artículos de este envío."
              : "Confirma que estos artículos todavía no fueron enviados ni entregados. Se cancelará esta preparación; el pedido y el pago se conservan."
        }
        confirmLabel={label}
        variant={operation === "cancel_fulfillment" ? "destructive" : "default"}
        isPending={pending}
        returnFocusRef={buttonRef}
        onConfirm={() => {
          if (isSavingRef.current || !submittedRef.current) return;
          const form = submittedRef.current;
          isSavingRef.current = true;
          startTransition(async () => {
            try {
              setState(await orderAction(state, form));
            } catch {
              setState({
                status: "error",
                message:
                  "No se pudo confirmar el cambio. Actualiza el pedido antes de reintentar.",
              });
            } finally {
              isSavingRef.current = false;
              setIsConfirming(false);
            }
          });
        }}
      />
    </>
  );
}
