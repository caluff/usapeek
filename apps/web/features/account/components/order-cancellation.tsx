"use client";

import type { StoreOrderCancellationResponse } from "@usapeek/api/finance-contracts";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cancelOrderAction } from "../cancellation-actions";
import {
  cancellationPayload,
  cancellationRequest,
  type CancellationState,
} from "../cancellation-form";

export function OrderCancellation({
  orderId,
  cancellation,
}: {
  orderId: string;
  cancellation: StoreOrderCancellationResponse["cancellation"];
}) {
  const router = useRouter();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<ReturnType<typeof cancellationRequest> | null>(
    null,
  );
  const submittedRef = useRef<FormData | null>(null);
  const isSavingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<CancellationState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();
  const isComplete = state.status === "success";
  if (!cancellation.allowed && !isComplete) return null;
  return (
    <>
      <Button
        ref={triggerRef}
        variant="link"
        className="min-h-11 px-0 font-normal text-muted-foreground underline hover:text-foreground"
        aria-haspopup="dialog"
        onClick={() => {
          if (!isComplete) {
            setNote("");
            setState({ status: "idle" });
          }
          setIsOpen(true);
        }}
      >
        {isComplete ? "Ver cancelación" : "Cancelar pedido"}
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!isSavingRef.current && !isConfirming) setIsOpen(open);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {isComplete ? "Pedido cancelado" : "Cancelar pedido"}
            </DialogTitle>
            <DialogDescription>
              {isComplete
                ? "La cancelación de este pedido quedó registrada."
                : "Indica el motivo antes de confirmar la cancelación."}
            </DialogDescription>
          </DialogHeader>
          {isComplete ? (
            <p role="status" className="text-sm">
              {state.message}
            </p>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  isSavingRef.current ||
                  isConfirming ||
                  !cancellation.allowed
                )
                  return;
                const form = new FormData(event.currentTarget);
                form.set("confirm", "yes");
                requestRef.current = cancellationRequest(
                  note,
                  requestRef.current,
                  () => crypto.randomUUID(),
                );
                form.set("request_id", requestRef.current.id);
                try {
                  cancellationPayload(form);
                } catch (error) {
                  setState({
                    status: "error",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Revisa el motivo.",
                  });
                  return;
                }
                submittedRef.current = form;
                returnFocusRef.current = reviewRef.current;
                setIsConfirming(true);
              }}
            >
              <fieldset
                disabled={isPending || isConfirming}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label htmlFor={`${id}-note`} className="text-sm font-medium">
                    Motivo
                  </label>
                  <Textarea
                    id={`${id}-note`}
                    name="note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    minLength={3}
                    maxLength={500}
                    required
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <Button ref={reviewRef} type="submit" variant="outline">
                    Revisar cancelación
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsOpen(false)}
                  >
                    Volver
                  </Button>
                </div>
              </fieldset>
              {state.message ? (
                <p
                  role={state.status === "error" ? "alert" : "status"}
                  className="text-sm text-destructive"
                >
                  {state.message}
                </p>
              ) : null}
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!isSavingRef.current) setIsConfirming(open);
        }}
        title="¿Cancelar este pedido?"
        description={
          <>
            Se cancelará el pedido de esta tienda. Si el pago ya fue cobrado, se
            devolverá el saldo correspondiente a este pedido.
            <span className="mt-2 block whitespace-pre-wrap break-words">
              Motivo: {note.trim()}
            </span>
          </>
        }
        confirmLabel="Cancelar pedido"
        cancelLabel="Volver"
        pendingLabel="Cancelando…"
        variant="destructive"
        isPending={isPending}
        returnFocusRef={returnFocusRef}
        onConfirm={() => {
          if (isSavingRef.current || !submittedRef.current) return;
          const form = submittedRef.current;
          isSavingRef.current = true;
          startTransition(async () => {
            try {
              const result = await cancelOrderAction(orderId, form);
              setState(result);
              if (result.status === "success") {
                requestRef.current = null;
                returnFocusRef.current = triggerRef.current;
                setIsOpen(false);
                router.refresh();
              }
            } catch {
              setState({
                status: "error",
                message:
                  "Se interrumpió la conexión. Actualiza el pedido antes de reintentar.",
              });
            } finally {
              isSavingRef.current = false;
              setIsConfirming(false);
            }
          });
        }}
      />
      {!isOpen && state.status === "success" ? (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      ) : null}
    </>
  );
}
