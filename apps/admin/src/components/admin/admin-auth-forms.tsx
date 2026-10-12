"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  confirmAdminEmailAction,
  forgotAdminPasswordAction,
  loginAdminAction,
  resendAdminVerificationAction,
  resetAdminPasswordAction,
  verifyAdminMfaAction,
} from "@/app/auth-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INITIAL_AUTH_STATE, type AuthActionState } from "@/lib/auth-utils";
import { withFeedbackToast } from "@/lib/feedback";
import { FeedbackToast } from "@/components/feedback-toast";

function Status({ state }: { state: AuthActionState }) {
  if (!state.message) return <span className="sr-only" aria-live="polite" />;
  return (
    <div
      aria-live="polite"
      className={
        state.status === "success"
          ? "rounded-md border border-success/35 bg-success/8 px-3 py-2.5 text-sm text-success-foreground"
          : state.status === "error"
            ? "rounded-md border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
          : "rounded-md border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm"
      }
    >
      {state.message}
      {state.externalUrl ? (
        <a href={state.externalUrl} className="mt-3 flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground">
          Continuar con el proveedor
        </a>
      ) : null}
    </div>
  );
}

function PasswordField({ id, name, label, autoComplete, error }: { id: string; name: string; label: string; autoComplete: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="h-11 pr-12" />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? <p id={`${id}-error`} className="text-xs font-medium text-warning-foreground">{error}</p> : null}
    </div>
  );
}

function EmailField({ error }: { error?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Correo electrónico</Label>
      <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(error)} aria-describedby={error ? "email-error" : undefined} className="h-11" />
      {error ? <p id="email-error" className="text-xs font-medium text-warning-foreground">{error}</p> : null}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return <Button type="submit" className="h-11 w-full" disabled={pending} aria-disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{pending ? "Procesando…" : children}</Button>;
}

export function AdminLoginForm({ next, expired, mfaMethods }: { next: string; expired: boolean; mfaMethods?: string[] }) {
  const [state, action, pending] = useActionState(withFeedbackToast(loginAdminAction), mfaMethods ? { status: "mfa_required", mfaMethods, message: "Confirma el segundo factor para continuar." } satisfies AuthActionState : INITIAL_AUTH_STATE);
  const [mfaState, mfaAction, mfaPending] = useActionState(withFeedbackToast(verifyAdminMfaAction), INITIAL_AUTH_STATE);
  if (state.status === "mfa_required") {
    return (
      <form action={mfaAction} className="space-y-4" aria-label="Verificación de segundo factor">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="method" value={state.mfaMethods?.[0] ?? "totp"} />
        <div className="space-y-2"><Label htmlFor="mfa-code">Código de verificación</Label><Input id="mfa-code" name="code" autoComplete="one-time-code" required className="h-11" /></div>
        <Status state={mfaState.message ? mfaState : state} />
        <Submit pending={mfaPending}>Confirmar código</Submit>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-4" aria-label="Acceso de operadores">
      <input type="hidden" name="next" value={next} />
      {expired ? <FeedbackToast status="warning" message="Tu sesión venció. Inicia sesión nuevamente." /> : null}
      {expired ? <p role="status" className="rounded-md border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm">Tu sesión venció. Inicia sesión nuevamente.</p> : null}
      <EmailField error={state.fieldErrors?.email} />
      <PasswordField id="password" name="password" label="Contraseña" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="flex justify-end"><Link href="/forgot-password" className="inline-flex min-h-11 items-center text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">¿Olvidaste tu contraseña?</Link></div>
      <Status state={state} />
      <Submit pending={pending}>Ingresar al panel</Submit>
    </form>
  );
}

export function AdminForgotForm() {
  const [state, action, pending] = useActionState(withFeedbackToast(forgotAdminPasswordAction), INITIAL_AUTH_STATE);
  return <form action={action} className="space-y-4" aria-label="Recuperación de contraseña de operador"><EmailField error={state.fieldErrors?.email} /><Status state={state} /><Submit pending={pending}>Enviar instrucciones</Submit><Link href="/login" className="flex min-h-11 items-center justify-center text-sm font-semibold underline underline-offset-4">Volver al acceso</Link></form>;
}

export function AdminResetForm({ hasToken }: { hasToken: boolean }) {
  const [state, action, pending] = useActionState(withFeedbackToast(resetAdminPasswordAction), INITIAL_AUTH_STATE);
  return <form action={action} className="space-y-4" aria-label="Restablecer contraseña de operador">{!hasToken && state.status === "idle" ? <><FeedbackToast status="error" message="El enlace no es válido o ya venció." /><Status state={{ status: "error", message: "El enlace no es válido o ya venció." }} /></> : null}<PasswordField id="new-password" name="password" label="Nueva contraseña" autoComplete="new-password" error={state.fieldErrors?.password} /><PasswordField id="confirmation" name="confirmation" label="Repite la contraseña" autoComplete="new-password" /><Status state={state} />{state.status === "success" ? <Link href="/login" className={buttonVariants({ className: "h-11 w-full" })}>Volver al acceso</Link> : <Submit pending={pending}>Guardar contraseña</Submit>}</form>;
}

export function AdminVerifyForm({ hasCode, next }: { hasCode: boolean; next: string }) {
  const [state, action, pending] = useActionState(withFeedbackToast(confirmAdminEmailAction), INITIAL_AUTH_STATE);
  const [retry, retryAction, retryPending] = useActionState(withFeedbackToast(resendAdminVerificationAction), INITIAL_AUTH_STATE);
  return <div className="space-y-4"><form action={action} className="space-y-4" aria-label="Verificación de correo de operador">{!hasCode ? <div className="space-y-2"><Label htmlFor="verification-code">Código</Label><Input id="verification-code" name="code" autoComplete="one-time-code" className="h-11" required /></div> : null}<Status state={state} />{state.status === "success" ? <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonVariants({ className: "h-11 w-full" })}>Iniciar sesión</Link> : <Submit pending={pending}>Verificar correo</Submit>}</form>{state.status !== "success" ? <form action={retryAction}><Button type="submit" variant="outline" className="h-11 w-full" disabled={retryPending}>{retryPending ? "Enviando…" : "Enviar otro código"}</Button><Status state={retry} /></form> : null}</div>;
}
