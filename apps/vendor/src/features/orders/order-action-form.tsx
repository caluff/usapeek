"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { updateOrderAction } from "./actions";
import { ORDER_NOTIFICATION_CHANGED } from "./notification-monitor";
import { useOrderManagementOption } from "./order-management-option";

export function OrderActionForm({
  orderId,
  action,
  fulfillmentId,
  label,
  confirmation,
  children,
  adjacentAction,
  destructive = false,
}: {
  orderId: string;
  action: string;
  fulfillmentId?: string;
  label: string;
  confirmation?: string;
  children?: ReactNode;
  adjacentAction?: ReactNode;
  destructive?: boolean;
}) {
  const management = useOrderManagementOption();
  const formId = useId();
  const [state, setState] = useState<MutationState>({ status: "idle" });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isPendingRef = useRef(false);
  const submittedFormRef = useRef<FormData | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function submit(form: FormData) {
    if (isPendingRef.current || state.status === "success") return;
    isPendingRef.current = true;
    management?.setBlocked(true);
    startTransition(async () => {
      try {
        const result = await updateOrderAction(state, form);
        setState(result);
        notifyFeedback(result);
        if (result.status === "success") {
          returnFocusRef.current =
            management?.returnFocusRef.current ?? buttonRef.current;
          management?.onSaved();
          window.dispatchEvent(new Event(ORDER_NOTIFICATION_CHANGED));
        }
      } catch {
        const result: MutationState = {
          status: "error",
          message:
            "No se pudo confirmar el cambio. Actualiza el pedido antes de reintentar.",
        };
        setState(result);
        notifyFeedback(result);
      } finally {
        isPendingRef.current = false;
        management?.setBlocked(false);
        submittedFormRef.current = null;
        setIsConfirming(false);
      }
    });
  }
  const submitButton = (
    <Button
      ref={buttonRef}
      type="submit"
      form={formId}
      disabled={
        isPending || management?.isBlocked || state.status === "success"
      }
      variant={destructive ? "outline" : "default"}
      className={`min-h-11 ${destructive ? "border-destructive/40 text-destructive" : ""}`}
    >
      {isPending ? "Actualizando…" : label}
    </Button>
  );
  return (
    <div className="space-y-4">
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            isPendingRef.current ||
            management?.getIsBlocked() ||
            isConfirming ||
            state.status === "success"
          )
            return;
          const form = new FormData(event.currentTarget);
          if (confirmation) {
            submittedFormRef.current = form;
            returnFocusRef.current = buttonRef.current;
            management?.setBlocked(true);
            setIsConfirming(true);
          } else submit(form);
        }}
        className="space-y-4"
      >
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="action" value={action} />
        {fulfillmentId ? (
          <input type="hidden" name="fulfillment_id" value={fulfillmentId} />
        ) : null}
        <fieldset
          disabled={
            isPending || management?.isBlocked || state.status === "success"
          }
          className="space-y-4"
        >
          {children}
          {!adjacentAction ? submitButton : null}
        </fieldset>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {state.message}
          </p>
        ) : null}
      </form>
      {adjacentAction ? (
        <div className="flex flex-wrap items-start gap-3">
          {submitButton}
          {adjacentAction}
        </div>
      ) : null}
      {confirmation ? (
        <ConfirmationDialog
          open={isConfirming}
          onOpenChange={(open) => {
            if (isPendingRef.current) return;
            setIsConfirming(open);
            management?.setBlocked(open);
            if (!open) submittedFormRef.current = null;
          }}
          title={label}
          description={confirmation}
          confirmLabel={label}
          variant={destructive ? "destructive" : "default"}
          isPending={isPending}
          returnFocusRef={returnFocusRef}
          onConfirm={() => {
            const form = submittedFormRef.current;
            if (!form || isPendingRef.current) return;
            form.set("confirmation", "yes");
            submit(form);
          }}
        />
      ) : null}
    </div>
  );
}
