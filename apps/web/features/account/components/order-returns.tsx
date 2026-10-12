"use client";

import type { CustomerReturnsResponse } from "@usapeek/api/finance-contracts";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestReturnAction } from "../return-actions";
import { returnPayload, returnRequest, type ReturnState } from "../return-form";

const RETURN_STATUS_LABELS = {
  pending: "Pendiente de revisión",
  approved: "Aprobada por la tienda",
  partially_received: "Recibida parcialmente",
  received: "Recibida",
  canceled: "Cancelada",
} satisfies Record<
  CustomerReturnsResponse["requests"][number]["status"],
  string
>;

export function OrderReturns({
  orderId,
  data: initial,
}: {
  orderId: string;
  data: CustomerReturnsResponse;
}) {
  const router = useRouter();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<ReturnType<typeof returnRequest> | null>(null);
  const submittedRef = useRef<FormData | null>(null);
  const isSavingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, setState] = useState<
    ReturnState & { source?: CustomerReturnsResponse }
  >({ status: "idle" });
  const [review, setReview] = useState<ReturnType<typeof returnPayload> | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const data = state.source === initial ? (state.data ?? initial) : initial;
  return (
    <div className="space-y-4">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        onClick={() => {
          setState((previous) => ({
            ...previous,
            status: "idle",
            message: undefined,
          }));
          setIsOpen(true);
        }}
      >
        Solicitar devolución
      </Button>
      {state.status === "success" && (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      )}
      {data.requests.length ? (
        <ul className="space-y-4" aria-label="Solicitudes de devolución">
          {data.requests.map((request) => (
            <li key={request.id} className="space-y-1 text-sm">
              <p className="font-medium">
                {RETURN_STATUS_LABELS[request.status]}
              </p>
              <p>
                {request.reason === "damaged"
                  ? "Producto dañado o defectuoso"
                  : request.reason === "wrong_item"
                    ? "Producto incorrecto"
                    : "Devolución gestionada por la tienda"}
              </p>
              {request.destination ? (
                <p className="whitespace-pre-wrap break-words">
                  Devuelve los artículos a: {request.destination}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {request.note}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sin solicitudes de devolución.
        </p>
      )}
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
            <DialogTitle>Solicitar devolución</DialogTitle>
            <DialogDescription>
              Selecciona los artículos afectados y describe el problema para que
              la tienda revise tu solicitud.
            </DialogDescription>
          </DialogHeader>
          {!data.eligibility.allowed ? (
            <p role="status" className="text-sm">
              {data.eligibility.reason ?? "La devolución no está disponible."}
            </p>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (isSavingRef.current || isConfirming) return;
                const form = new FormData(event.currentTarget);
                form.set("confirm", "yes");
                requestRef.current = returnRequest(
                  form,
                  requestRef.current,
                  () => crypto.randomUUID(),
                );
                form.set("request_id", requestRef.current.id);
                try {
                  setReview(returnPayload(form));
                } catch (error) {
                  setState((previous) => ({
                    ...previous,
                    status: "error",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Revisa la solicitud.",
                  }));
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
                  <label
                    htmlFor={`${id}-reason`}
                    className="text-sm font-medium"
                  >
                    Motivo
                  </label>
                  <NativeSelect
                    id={`${id}-reason`}
                    name="reason"
                    defaultValue="damaged"
                  >
                    <option value="damaged">
                      Producto dañado o defectuoso
                    </option>
                    <option value="wrong_item">Producto incorrecto</option>
                  </NativeSelect>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Artículos</p>
                  {data.items
                    .filter((item) => item.available_quantity > 0)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4"
                      >
                        <label htmlFor={`${id}-${item.id}`} className="text-sm">
                          {item.title}
                          <span className="block text-xs text-muted-foreground">
                            {item.available_quantity} disponibles para devolver
                          </span>
                        </label>
                        <Input
                          id={`${id}-${item.id}`}
                          name={`quantity:${item.id}`}
                          className="w-20 shrink-0"
                          type="number"
                          min={0}
                          max={Math.min(item.available_quantity, 999)}
                          step={1}
                          defaultValue={0}
                          required
                        />
                      </div>
                    ))}
                </div>
                <div className="space-y-2">
                  <label htmlFor={`${id}-note`} className="text-sm font-medium">
                    Describe el problema
                  </label>
                  <Textarea
                    id={`${id}-note`}
                    name="note"
                    minLength={3}
                    maxLength={500}
                    required
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <Button ref={reviewRef} type="submit" variant="outline">
                    Revisar solicitud
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
              {state.status === "error" && (
                <p role="alert" className="text-sm text-destructive">
                  {state.message}
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!isSavingRef.current) setIsConfirming(open);
        }}
        title="¿Solicitar esta devolución?"
        description={
          <span className="space-y-2">
            <span className="block">
              La tienda revisará tu solicitud antes de indicar cómo devolver los
              artículos.
            </span>
            <span className="block">
              {review?.reason === "wrong_item"
                ? "Producto incorrecto"
                : "Producto dañado o defectuoso"}
            </span>
            {review?.items.map((item) => (
              <span key={item.id} className="block">
                {item.quantity} ×{" "}
                {data.items.find((entry) => entry.id === item.id)?.title}
              </span>
            ))}
            <span className="block whitespace-pre-wrap break-words">
              {review?.note}
            </span>
          </span>
        }
        confirmLabel="Solicitar devolución"
        cancelLabel="Volver"
        pendingLabel="Enviando…"
        isPending={isPending}
        returnFocusRef={returnFocusRef}
        onConfirm={() => {
          if (isSavingRef.current || !submittedRef.current) return;
          const form = submittedRef.current;
          isSavingRef.current = true;
          startTransition(async () => {
            try {
              const result = await requestReturnAction(orderId, form);
              setState({ ...result, source: initial });
              if (result.status === "success") {
                requestRef.current = null;
                returnFocusRef.current = triggerRef.current;
                setIsOpen(false);
                router.refresh();
              }
            } catch {
              setState((previous) => ({
                ...previous,
                status: "error",
                message:
                  "Se interrumpió la conexión. Actualiza el pedido antes de reintentar.",
              }));
            } finally {
              isSavingRef.current = false;
              setIsConfirming(false);
            }
          });
        }}
      />
    </div>
  );
}
