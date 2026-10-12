"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { loginVendorGoogleAction } from "@/app/auth/google/actions";
import { Button } from "@/components/ui/button";
import { INITIAL_VENDOR_AUTH_STATE } from "@/lib/auth-utils";

export function GoogleLoginForm({ next, link = false }: { next: string; link?: boolean }) {
  const [state, action, pending] = useActionState(loginVendorGoogleAction, INITIAL_VENDOR_AUTH_STATE);
  return (
    <form action={action} className="mt-4 space-y-3" aria-label={link ? "Vincular cuenta con Google" : "Acceder con Google"}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="link" value={String(link)} />
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pending} aria-disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Conectando…" : link ? "Vincular Google a mi cuenta" : "Continuar con Google"}
      </Button>
      {state.message ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    </form>
  );
}

