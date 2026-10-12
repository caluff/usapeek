"use client";

import type { SellerMemberDTO } from "@mercurjs/types";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  confirmVendorEmailAction,
  forgotVendorPasswordAction,
  loginVendorAction,
  resendVendorVerificationAction,
  resetVendorPasswordAction,
  selectVendorSellerAction,
  verifyVendorMfaAction,
} from "@/app/seller/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INITIAL_VENDOR_AUTH_STATE, type VendorAuthActionState } from "@/lib/auth-utils";
import { useFeedbackToast } from "@/components/feedback-toast";

const EXPIRED_SESSION = { status: "warning", message: "Tu sesión venció. Inicia sesión nuevamente." };
const INVALID_RESET_LINK: VendorAuthActionState = { status: "error", message: "El enlace no es válido o ya venció." };

function Status({ state }: { state: VendorAuthActionState }) {
  useFeedbackToast(state);
  if (!state.message) return <span aria-live="polite" className="sr-only" />;
  return <div aria-live="polite" className={state.status === "success" ? "rounded-lg border border-success/35 bg-success/8 px-4 py-3 text-sm" : state.status === "error" ? "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" : "rounded-lg border border-warning/55 bg-warning/10 px-4 py-3 text-sm"}>{state.message}{state.externalUrl ? <a className="mt-3 flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground" href={state.externalUrl}>Continuar con el proveedor</a> : null}</div>;
}

function PasswordField({ id, name, label, autoComplete, error }: { id: string; name: string; label: string; autoComplete: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="relative"><Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="h-11 pr-12" /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}</button></div>{error ? <p id={`${id}-error`} className="text-xs font-semibold text-primary">{error}</p> : null}</div>;
}

function EmailField({ error }: { error?: string }) {
  return <div className="space-y-2"><Label htmlFor="email">Correo electrónico</Label><Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(error)} aria-describedby={error ? "email-error" : undefined} className="h-11" />{error ? <p id="email-error" className="text-xs font-semibold text-primary">{error}</p> : null}</div>;
}

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return <Button type="submit" className="h-11 w-full" disabled={pending} aria-disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{pending ? "Procesando…" : children}</Button>;
}

export function VendorLoginForm({ next, expired, mfaMethods }: { next: string; expired: boolean; mfaMethods?: string[] }) {
  useFeedbackToast(expired ? EXPIRED_SESSION : null);
  const [state, action, pending] = useActionState(loginVendorAction, mfaMethods ? { status: "mfa_required", mfaMethods, message: "Confirma el segundo factor para continuar." } satisfies VendorAuthActionState : INITIAL_VENDOR_AUTH_STATE);
  const [mfa, mfaAction, mfaPending] = useActionState(verifyVendorMfaAction, INITIAL_VENDOR_AUTH_STATE);
  if (state.status === "mfa_required") return <form action={mfaAction} className="space-y-5" aria-label="Verificación de segundo factor"><input type="hidden" name="next" value={next} /><input type="hidden" name="method" value={state.mfaMethods?.[0] ?? "totp"} /><div className="space-y-2"><Label htmlFor="mfa-code">Código de verificación</Label><Input id="mfa-code" name="code" autoComplete="one-time-code" required className="h-11" /></div><Status state={mfa.message ? mfa : state} /><Submit pending={mfaPending}>Confirmar código</Submit></form>;
  return <form action={action} className="space-y-5" aria-label="Acceso de miembros vendedores"><input type="hidden" name="next" value={next} />{expired ? <p role="status" className="rounded-lg border border-warning/55 bg-warning/10 px-4 py-3 text-sm">Tu sesión venció. Inicia sesión nuevamente.</p> : null}<EmailField error={state.fieldErrors?.email} /><PasswordField id="password" name="password" label="Contraseña" autoComplete="current-password" error={state.fieldErrors?.password} /><div className="flex justify-end"><Link href="/seller/forgot-password" className="inline-flex min-h-11 items-center text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">¿Olvidaste tu contraseña?</Link></div><Status state={state} /><Submit pending={pending}>Ingresar al portal</Submit></form>;
}

export function VendorForgotForm() {
  const [state, action, pending] = useActionState(forgotVendorPasswordAction, INITIAL_VENDOR_AUTH_STATE);
  return <form action={action} className="space-y-5" aria-label="Recuperación de acceso de miembro"><EmailField error={state.fieldErrors?.email} /><Status state={state} /><Submit pending={pending}>Enviar instrucciones</Submit><Link href="/seller/login" className="flex min-h-11 items-center justify-center text-sm font-semibold underline underline-offset-4">Volver al acceso</Link></form>;
}

export function VendorResetForm({ hasToken }: { hasToken: boolean }) {
  const [state, action, pending] = useActionState(resetVendorPasswordAction, INITIAL_VENDOR_AUTH_STATE);
  return <form action={action} className="space-y-5" aria-label="Restablecer contraseña de miembro">{!hasToken && state.status === "idle" ? <Status state={INVALID_RESET_LINK} /> : null}<PasswordField id="new-password" name="password" label="Nueva contraseña" autoComplete="new-password" error={state.fieldErrors?.password} /><PasswordField id="confirmation" name="confirmation" label="Repite la contraseña" autoComplete="new-password" /><Status state={state} />{state.status === "success" ? <Button asChild className="h-11 w-full"><Link href="/seller/login">Volver al acceso</Link></Button> : <Submit pending={pending}>Guardar contraseña</Submit>}</form>;
}

export function VendorVerifyForm({ hasCode, next }: { hasCode: boolean; next: string }) {
  const [state, action, pending] = useActionState(confirmVendorEmailAction, INITIAL_VENDOR_AUTH_STATE);
  const [retry, retryAction, retryPending] = useActionState(resendVendorVerificationAction, INITIAL_VENDOR_AUTH_STATE);
  return <div className="space-y-4"><form action={action} className="space-y-5" aria-label="Verificación de correo de miembro">{!hasCode ? <div className="space-y-2"><Label htmlFor="verification-code">Código</Label><Input id="verification-code" name="code" autoComplete="one-time-code" required className="h-11" /></div> : null}<Status state={state} />{state.status === "success" ? <Button asChild className="h-11 w-full"><Link href={`/seller/login?next=${encodeURIComponent(next)}`}>Iniciar sesión</Link></Button> : <Submit pending={pending}>Verificar correo</Submit>}</form>{state.status !== "success" ? <form action={retryAction}><Button type="submit" variant="outline" className="h-11 w-full" disabled={retryPending}>{retryPending ? "Enviando…" : "Enviar otro código"}</Button><Status state={retry} /></form> : null}</div>;
}

export function VendorSellerSelectionForm({ memberships, next }: { memberships: SellerMemberDTO[]; next: string }) {
  const [state, action, pending] = useActionState(selectVendorSellerAction, INITIAL_VENDOR_AUTH_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (memberships.length === 1) formRef.current?.requestSubmit();
  }, [memberships.length]);
  return <form ref={formRef} action={action} className="space-y-4" aria-label="Selección de tienda"><input type="hidden" name="next" value={next} />{memberships.map((membership, index) => <label key={membership.seller.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 outline-none has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-ring/25"><input type="radio" name="sellerId" value={membership.seller.id} defaultChecked={index === 0} className="size-4 accent-primary" /><span className="min-w-0"><span className="block truncate font-semibold">{membership.seller.name}</span><span className="block truncate text-xs text-muted-foreground">{membership.role_id}</span></span></label>)}<Status state={state} />{memberships.length === 1 ? <p role="status" className="text-center text-sm text-muted-foreground">Seleccionando tu tienda…</p> : <Submit pending={pending}>Continuar con esta tienda</Submit>}</form>;
}
