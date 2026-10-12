"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INITIAL_VENDOR_AUTH_STATE, type VendorAuthActionState } from "@/lib/auth-utils";
import { updateAccountProfileAction } from "./profile-actions";

export function AccountProfileForm({
  firstName,
  lastName,
  returnTo,
  onSaved,
}: {
  firstName?: string | null;
  lastName?: string | null;
  returnTo?: string;
  onSaved?: () => void;
}) {
  const [state, action, isPending] = useActionState(
    async (previous: VendorAuthActionState, form: FormData) => {
      const result = await updateAccountProfileAction(previous, form);
      if (result.status === "success") onSaved?.();
      return result;
    },
    INITIAL_VENDOR_AUTH_STATE,
  );
  return (
    <form action={action} className="space-y-5">
      {returnTo ? <input type="hidden" name="next" value={returnTo} /> : null}
      <fieldset disabled={isPending} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="account-first-name">Nombre</Label>
          <Input
            id="account-first-name"
            name="first_name"
            autoComplete="given-name"
            maxLength={100}
            required
            defaultValue={firstName ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-last-name">Apellido (opcional)</Label>
          <Input
            id="account-last-name"
            name="last_name"
            autoComplete="family-name"
            maxLength={100}
            defaultValue={lastName ?? ""}
          />
        </div>
      </fieldset>
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
      <Button type="submit" disabled={isPending}>
        {isPending
          ? "Guardando…"
          : returnTo
            ? "Guardar y continuar"
            : "Guardar perfil"}
      </Button>
    </form>
  );
}
