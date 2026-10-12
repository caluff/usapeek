"use client";

import { useActionState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyFeedback } from "@/lib/feedback";
import {
  startStripeOnboardingAction,
  type StripeOnboardingState,
} from "./actions";

export function StripeOnboardingButton({ label }: { label: string }) {
  const [state, action, isPending] = useActionState<
    StripeOnboardingState,
    FormData
  >(
    async () => {
      const result = await startStripeOnboardingAction();
      notifyFeedback(result);
      if (result.status === "success") window.location.assign(result.url);
      return result;
    },
    { status: "idle" },
  );
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" disabled={isPending || state.status === "success"}>
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ExternalLink className="size-4" aria-hidden="true" />
        )}
        {isPending ? "Conectando con Stripe…" : label}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
