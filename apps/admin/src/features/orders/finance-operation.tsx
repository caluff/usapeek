"use client";

import type {
  OrderFinanceInput,
  OrderFinanceResponse,
} from "@usapeek/api/finance-contracts";
import { useId, useRef, useState, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SettingsOption } from "@/components/ui/settings-option";
import { notifyFeedback } from "@/lib/feedback";
import { money } from "./helpers";
import { orderFinanceAction } from "./finance-actions";
import {
  financePayload,
  financeRequest,
  availableFinanceOperations,
  type FinanceActionState,
} from "./finance-form";

type Finance = OrderFinanceResponse["finance"];
type Request = ReturnType<typeof financeRequest> | null;

export function OrderFinanceOperation({
  finance,
  operation,
  fallbackFocusRef,
  onSaved,
}: {
  finance: Finance;
  operation: OrderFinanceInput["action"];
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onSaved: (data: OrderFinanceResponse) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<Request>(null);
  const isBlockedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const eligibility =
    operation === "capture"
      ? finance.capture
      : operation === "refund"
        ? finance.refund
        : finance.cancellation;
  const label =
    operation === "capture"
      ? "Cobrar compra"
      : operation === "refund"
        ? "Reembolsar"
        : "Cancelar pedido";
  if (!eligibility.allowed && !isOpen) return null;
  return (
    <div ref={containerRef}>
      <SettingsOption
        label={label}
        value={
          operation === "capture"
            ? money(finance.capture.amount, finance.currency_code)
            : operation === "refund"
              ? `${money(finance.refundable_total, finance.currency_code)} disponibles`
              : "No cancelado"
        }
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
        {isOpen &&
          (eligibility.allowed ? (
            <FinanceEditor
              finance={finance}
              operation={operation}
              requestRef={requestRef}
              triggerRef={triggerRef}
              fallbackFocusRef={fallbackFocusRef}
              onBlockedChange={(blocked) => {
                isBlockedRef.current = blocked;
              }}
              onCancel={() => {
                if (!isBlockedRef.current) setIsOpen(false);
              }}
              onSaved={(data) => {
                setIsOpen(false);
                if (data) onSaved(data);
                router.refresh();
              }}
            />
          ) : (
            <p
              role="status"
              className="text-sm leading-6 text-muted-foreground"
            >
              {eligibility.reason ||
                "Esta operación no está disponible para el pedido."}
            </p>
          ))}
      </SettingsOption>
    </div>
  );
}

function FinanceEditor({
  finance,
  operation,
  requestRef,
  triggerRef,
  fallbackFocusRef,
  onBlockedChange,
  onCancel,
  onSaved,
}: {
  finance: Finance;
  operation: OrderFinanceInput["action"];
  requestRef: RefObject<Request>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onBlockedChange: (blocked: boolean) => void;
  onCancel: () => void;
  onSaved: (data?: OrderFinanceResponse) => void;
}) {
  const id = useId();
  const [refundMode, setRefundMode] = useState("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<FinanceActionState>({ status: "idle" });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isSavingRef = useRef(false);
  const submittedRef = useRef<FormData | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement>(null);
  const amount =
    operation === "capture"
      ? finance.capture.amount
      : operation === "cancel"
        ? finance.cancellation.refund_amount
        : refundMode === "partial"
          ? Number(partialAmount)
          : finance.refundable_total;
  return (
    <>
      <form
        className="space-y-5"
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (isSavingRef.current || isConfirming) return;
          const form = new FormData(event.currentTarget);
          form.set("action", operation);
          form.set("confirm", "yes");
          requestRef.current = financeRequest(form, requestRef.current, () =>
            crypto.randomUUID(),
          );
          form.set("request_id", requestRef.current.id);
          try {
            financePayload(form);
          } catch (error) {
            setState({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Revisa los datos de la solicitud.",
            });
            return;
          }
          submittedRef.current = form;
          returnFocusRef.current = submitRef.current;
          onBlockedChange(true);
          setIsConfirming(true);
        }}
      >
        <fieldset disabled={isPending || isConfirming} className="space-y-5">
          {operation === "refund" ? (
            <div className="space-y-3">
              <label htmlFor={`${id}-mode`} className="text-sm font-medium">
                Importe del reembolso
              </label>
              <NativeSelect
                id={`${id}-mode`}
                value={refundMode}
                onChange={(event) => setRefundMode(event.target.value)}
              >
                <NativeSelectOption value="full">
                  Todo el saldo disponible
                </NativeSelectOption>
                <NativeSelectOption value="partial">
                  Importe parcial
                </NativeSelectOption>
              </NativeSelect>
              {refundMode === "partial" ? (
                <div className="space-y-2">
                  <label
                    htmlFor={`${id}-amount`}
                    className="text-sm font-medium"
                  >
                    Importe en {finance.currency_code.toUpperCase()}
                  </label>
                  <Input
                    id={`${id}-amount`}
                    name="amount"
                    value={partialAmount}
                    onChange={(event) => setPartialAmount(event.target.value)}
                    type="number"
                    min={0.01}
                    max={finance.refundable_total}
                    step="0.01"
                    required
                  />
                </div>
              ) : (
                <input
                  type="hidden"
                  name="amount"
                  value={finance.refundable_total}
                />
              )}
              <p className="text-sm text-muted-foreground">
                Máximo: {money(finance.refundable_total, finance.currency_code)}
              </p>
            </div>
          ) : operation === "capture" ? (
            <div className="space-y-2 text-sm">
              <p>
                Importe a cobrar de la compra:{" "}
                <strong className="tabular-nums">
                  {money(amount, finance.currency_code)}
                </strong>
              </p>
              <p className="text-muted-foreground">
                Incluye todos los pedidos activos de esta compra compartida,
                también los de otros vendedores. Excluye los pedidos cancelados.
                El servidor calcula el importe final.
              </p>
            </div>
          ) : (
            <p className="text-sm">
              Reembolso al cancelar:{" "}
              <strong className="tabular-nums">
                {money(amount, finance.currency_code)}
              </strong>
            </p>
          )}
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
          <div className="flex flex-wrap gap-3">
            <Button ref={submitRef} type="submit" variant="outline">
              {isPending ? "Procesando…" : "Revisar operación"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </fieldset>
        {state.message && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
      </form>
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (isSavingRef.current) return;
          onBlockedChange(open);
          setIsConfirming(open);
        }}
        title={
          operation === "capture"
            ? "¿Cobrar esta compra?"
            : operation === "cancel"
              ? "¿Cancelar este pedido?"
              : "¿Reembolsar este importe?"
        }
        description={
          <>
            {operation === "capture"
              ? "Se cobrarán "
              : operation === "cancel"
                ? "Se cancelará el pedido y se devolverán "
                : "Se devolverán "}
            <strong>{money(amount, finance.currency_code)}</strong>
            {operation === "capture"
              ? " de todos los pedidos activos de la compra compartida."
              : " al comprador."}
            <span className="mt-2 block whitespace-pre-wrap break-words">
              Motivo: {note.trim()}
            </span>
          </>
        }
        confirmLabel={
          operation === "capture"
            ? "Cobrar compra"
            : operation === "cancel"
              ? "Cancelar pedido"
              : "Reembolsar"
        }
        pendingLabel="Procesando…"
        cancelLabel="Volver"
        variant={operation === "capture" ? "default" : "destructive"}
        isPending={isPending}
        returnFocusRef={returnFocusRef}
        onConfirm={() => {
          if (isSavingRef.current || !submittedRef.current) return;
          const form = submittedRef.current;
          isSavingRef.current = true;
          onBlockedChange(true);
          startTransition(async () => {
            try {
              const result = await orderFinanceAction(
                finance.order_id,
                state,
                form,
              );
              setState(result);
              notifyFeedback(result);
              if (result.status === "success") {
                requestRef.current = null;
                const remainsAvailable =
                  result.data &&
                  availableFinanceOperations(result.data.finance).some(
                    (option) => option.value === operation,
                  );
                returnFocusRef.current = remainsAvailable
                  ? triggerRef.current
                  : fallbackFocusRef.current;
                onSaved(result.data);
              }
            } catch {
              setState({
                status: "error",
                message:
                  "Se interrumpió la conexión. Consulta el historial antes de iniciar otra operación; reintenta con los mismos datos para consultar la misma solicitud.",
              });
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
