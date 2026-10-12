"use client"

import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useActionState, useState, type ReactNode } from "react"

import {
  confirmCustomerEmailAction,
  forgotCustomerPasswordAction,
  loginCustomerAction,
  registerCustomerAction,
  resendCustomerVerificationAction,
  resetCustomerPasswordAction,
  verifyCustomerMfaAction,
} from "@/app/auth-actions"
import { Button } from "@/components/ui/button"
import { FeedbackToast } from "@/components/feedback-toast"
import { INITIAL_AUTH_STATE, type AuthActionState } from "@/lib/auth-utils"
import { AUTH_HONEYPOT_FIELD } from "@/lib/auth-form-protection"

const EXPIRED_SESSION_FEEDBACK = { status: "warning", message: "Tu sesión venció. Inicia sesión nuevamente." }
const INVALID_RESET_FEEDBACK: AuthActionState = { status: "error", message: "El enlace no es válido o ya venció. Solicita uno nuevo." }

function AuthHoneypot({ id }: { id: string }) {
  return (
    <div className="sr-only" aria-hidden="true">
      <label htmlFor={id}>Deja este campo vacío</label>
      <input id={id} name={AUTH_HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="font-sans text-xs font-semibold text-destructive">{message}</p> : null
}

function Status({ state }: { state: AuthActionState }) {
  return (
    <>
      <FeedbackToast feedback={state} />
      {state.status === "external_redirect" && state.externalUrl ? (
        <a className="mt-3 flex min-h-11 items-center justify-center bg-primary px-4 font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring" href={state.externalUrl}>Continuar con el proveedor</a>
      ) : null}
    </>
  )
}

function TextField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  error,
  placeholder,
}: {
  id: string
  name: string
  label: string
  type?: string
  autoComplete?: string
  error?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-sans text-sm font-bold">{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full border border-input bg-background px-3 font-sans text-base outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring" />
      <div id={`${id}-error`}><FieldError message={error} /></div>
    </div>
  )
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
  labelAction,
}: {
  id: string
  name: string
  label: string
  autoComplete: string
  error?: string
  labelAction?: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="block font-sans text-sm font-bold">{label}</label>
        {labelAction}
      </div>
      <div className="relative">
        <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full border border-input bg-background px-3 pr-12 font-sans text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring" />
        <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring">
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </div>
      <div id={`${id}-error`}><FieldError message={error} /></div>
    </div>
  )
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return <Button type="submit" className="w-full" disabled={pending} aria-disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{pending ? "Procesando…" : children}</Button>
}

export function CustomerLoginForm({
  next,
  expired,
  initialState = INITIAL_AUTH_STATE,
  isLinkingGoogle = false,
  alternativeLogin,
}: {
  next: string
  expired?: boolean
  initialState?: AuthActionState
  isLinkingGoogle?: boolean
  alternativeLogin?: ReactNode
}) {
  const [state, action, pending] = useActionState(loginCustomerAction, initialState)
  const [mfaState, mfaAction, mfaPending] = useActionState(verifyCustomerMfaAction, INITIAL_AUTH_STATE)

  if (state.status === "mfa_required") {
    return (
      <form action={mfaAction} className="space-y-5" aria-label="Verificación de segundo factor">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="method" value={state.mfaMethods?.[0] ?? "totp"} />
        <TextField id="mfa-code" name="code" label="Código de verificación" autoComplete="one-time-code" error={mfaState.fieldErrors?.code} />
        <Status state={mfaState.message ? mfaState : state} />
        <SubmitButton pending={mfaPending}>Confirmar código</SubmitButton>
      </form>
    )
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-6" aria-label={isLinkingGoogle ? "Confirmar cuenta para vincular Google" : "Inicio de sesión de cliente"}>
        <input type="hidden" name="next" value={next} />
        {expired ? <FeedbackToast feedback={EXPIRED_SESSION_FEEDBACK} /> : null}
        <TextField id="login-email" name="email" label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@correo.com" error={state.fieldErrors?.email} />
        <PasswordField id="login-password" name="password" label="Contraseña" autoComplete="current-password" error={state.fieldErrors?.password} labelAction={
          <Link href="/forgot-password" className="-my-3 inline-flex min-h-11 items-center text-right text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">¿Olvidaste tu contraseña?</Link>
        } />
        <Status state={state} />
        <SubmitButton pending={pending}>{isLinkingGoogle ? "Confirmar mi cuenta" : "Iniciar sesión"}</SubmitButton>
      </form>
      {alternativeLogin}
      {isLinkingGoogle ? (
        <Link href="/login" className="flex min-h-11 items-center justify-center font-sans text-sm font-bold underline underline-offset-4">Volver al inicio de sesión</Link>
      ) : (
        <p className="text-center font-sans text-sm text-muted-foreground">¿No tienes una cuenta? <Link href="/register" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground">Regístrate</Link></p>
      )}
    </div>
  )
}

export function CustomerRegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAction, INITIAL_AUTH_STATE)
  return (
    <form action={action} className="space-y-5" aria-label="Registro de cliente">
      <AuthHoneypot id="register-website" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="register-first-name" name="firstName" label="Nombre" autoComplete="given-name" error={state.fieldErrors?.firstName} />
        <TextField id="register-last-name" name="lastName" label="Apellido" autoComplete="family-name" error={state.fieldErrors?.lastName} />
      </div>
      <TextField id="register-email" name="email" label="Correo electrónico" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <PasswordField id="register-password" name="password" label="Contraseña" autoComplete="new-password" error={state.fieldErrors?.password} />
      <Status state={state} />
      <SubmitButton pending={pending}>Crear cuenta</SubmitButton>
      <p className="text-center font-sans text-sm text-muted-foreground">¿Ya tienes cuenta? <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-foreground underline underline-offset-4 hover:text-accent">Inicia sesión</Link></p>
    </form>
  )
}

export function CustomerForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotCustomerPasswordAction, INITIAL_AUTH_STATE)
  return (
    <form action={action} className="space-y-5" aria-label="Recuperación de contraseña">
      <AuthHoneypot id="forgot-website" />
      <TextField id="forgot-email" name="email" label="Correo electrónico" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Status state={state} />
      <SubmitButton pending={pending}>Enviar instrucciones</SubmitButton>
      <Link href="/login" className="flex min-h-11 items-center justify-center font-sans text-sm font-bold underline underline-offset-4">Volver al acceso</Link>
    </form>
  )
}

export function CustomerResetPasswordForm({ hasToken }: { hasToken: boolean }) {
  const [state, action, pending] = useActionState(resetCustomerPasswordAction, INITIAL_AUTH_STATE)
  return (
    <form action={action} className="space-y-5" aria-label="Restablecer contraseña">
      {!hasToken && state.status === "idle" ? <Status state={INVALID_RESET_FEEDBACK} /> : null}
      <PasswordField id="reset-password" name="password" label="Nueva contraseña" autoComplete="new-password" error={state.fieldErrors?.password} />
      <PasswordField id="reset-confirmation" name="confirmation" label="Repite la contraseña" autoComplete="new-password" />
      <Status state={state} />
      {state.status === "success" ? <Link href="/login" className="flex min-h-11 items-center justify-center bg-primary px-4 font-sans text-sm font-semibold text-primary-foreground">Ir al acceso</Link> : <SubmitButton pending={pending}>Guardar contraseña</SubmitButton>}
    </form>
  )
}

export function CustomerVerifyEmailForm({ hasCode, next }: { hasCode: boolean; next: string }) {
  const [state, action, pending] = useActionState(confirmCustomerEmailAction, INITIAL_AUTH_STATE)
  const [resendState, resendAction, resendPending] = useActionState(resendCustomerVerificationAction, INITIAL_AUTH_STATE)
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5" aria-label="Verificación de correo">
        {!hasCode ? <TextField id="verification-code" name="code" label="Código de verificación" autoComplete="one-time-code" error={state.fieldErrors?.code} /> : null}
        <Status state={state} />
        {state.status === "success" ? <Link href={`/login?next=${encodeURIComponent(next)}`} className="flex min-h-11 items-center justify-center bg-primary px-4 font-sans text-sm font-semibold text-primary-foreground">Iniciar sesión</Link> : <SubmitButton pending={pending}>Verificar correo</SubmitButton>}
      </form>
      {state.status !== "success" ? <form action={resendAction}><Button type="submit" variant="outline" className="w-full" disabled={resendPending}>{resendPending ? "Enviando…" : "Enviar otro código"}</Button><Status state={resendState} /></form> : null}
    </div>
  )
}
