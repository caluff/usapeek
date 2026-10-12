"use client";

import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
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
import { formatMoney as money } from "../workspace/presentation";
import { orderFinanceAction } from "./finance-actions";
import {
  financePayload,
  financeRequest,
  type FinanceActionState,
} from "./finance-form";
import { ORDER_NOTIFICATION_CHANGED } from "./notification-monitor";

type Finance = OrderFinanceResponse["finance"];
type Request = ReturnType<typeof financeRequest> | null;

export function OrderFinanceOperation({
  finance,
  operation,
  isCanceled = false,
}: {
  finance: Finance;
  operation: "refund" | "cancel";
  isCanceled?: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<Request>(null);
  const isBlockedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const eligibility =
    operation === "refund" ? finance.refund : finance.cancellation;
  const label = operation === "refund" ? "Reembolsar" : "Cancelar pedido";
  return (
    <div ref={containerRef}>
      <SettingsOption
        label={label}
        value={
          operation === "refund"
            ? finance.refunded_total > 0
              ? `${new Intl.NumberFormat("es-UY", {
                  style: "currency",
                  currency: finance.currency_code,
                  currencyDisplay: "code",
                }).format(finance.refunded_total)} reembolsado`
              : "No reembolsado"
            : isCanceled
              ? "Cancelado"
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
              onBlockedChange={(blocked) => {
                isBlockedRef.current = blocked;
              }}
              onCancel={() => {
                if (!isBlockedRef.current) setIsOpen(false);
              }}
              onSaved={() => {
                setIsOpen(false);
                window.dispatchEvent(new Event(ORDER_NOTIFICATION_CHANGED));
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
  onBlockedChange,
  onCancel,
  onSaved,
}: {
  finance: Finance;
  operation: "refund" | "cancel";
  requestRef: RefObject<Request>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onBlockedChange: (blocked: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
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
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const amount =
    operation === "cancel"
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
        <fieldset disabled={isPending} className="space-y-5">
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
          operation === "cancel"
            ? "¿Cancelar este pedido?"
            : "¿Reembolsar este importe?"
        }
        description={
          <>
            {operation === "cancel"
              ? "Se cancelará el pedido y se devolverán "
              : "Se devolverán "}
            <strong>{money(amount, finance.currency_code)}</strong> al
            comprador.{" "}
            <span className="mt-2 block whitespace-pre-wrap break-words">
              Motivo: {note.trim()}
            </span>
          </>
        }
        confirmLabel={operation === "cancel" ? "Cancelar pedido" : "Reembolsar"}
        pendingLabel="Procesando…"
        variant="destructive"
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
                returnFocusRef.current = triggerRef.current;
                onSaved();
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
