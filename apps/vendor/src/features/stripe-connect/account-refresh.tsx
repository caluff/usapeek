"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyFeedback } from "@/lib/feedback";
import { refreshStripeAccountAction, type StripeRefreshState } from "./actions";

export function StripeAccountRefresh({
  returned = false,
}: {
  returned?: boolean;
}) {
  const returnHandled = useRef(false);
  const [state, action, isPending] = useActionState<
    StripeRefreshState,
    FormData
  >(
    async () => {
      const result = await refreshStripeAccountAction();
      notifyFeedback(result);
      return result;
    },
    { status: "idle" },
  );

  useEffect(() => {
    if (!returned || returnHandled.current) return;
    returnHandled.current = true;
    // Consume the return marker before the request; refresh/retry never loops.
    const url = new URL(window.location.href);
    if (url.searchParams.get("returned") !== "1") return;
    url.searchParams.delete("returned");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    startTransition(() => action(new FormData()));
  }, [returned, action]);

  return (
    <form action={action} className="space-y-3" aria-busy={isPending}>
      {returned && state.status === "idle" ? (
        <p className="text-sm text-muted-foreground">
          Volviste de Stripe. Estamos consultando el estado de tu cuenta;
          regresar no confirma la verificación.
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {isPending
          ? "Verificando con Stripe…"
          : "Actualizar estado desde Stripe"}
      </Button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
