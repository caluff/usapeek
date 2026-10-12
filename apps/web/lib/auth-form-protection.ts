import type { AuthActionState } from "./auth-utils"

export const AUTH_HONEYPOT_FIELD = "website"
export const REGISTRATION_ERROR =
  "No pudimos completar el registro. Revisa los datos o recupera tu contraseña."
export const AUTH_RATE_LIMIT_MESSAGE =
  "Demasiados intentos. Espera unos minutos y vuelve a intentarlo."

export function passwordRecoveryResponse(): AuthActionState {
  return {
    status: "success",
    message:
      "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña.",
  }
}

export function authHoneypotResponse(
  form: FormData,
  intent: "register" | "forgot-password",
): AuthActionState | null {
  if (form.getAll(AUTH_HONEYPOT_FIELD).every((value) => value === "")) {
    return null
  }

  return intent === "forgot-password"
    ? passwordRecoveryResponse()
    : { status: "error", message: REGISTRATION_ERROR }
}

export function authRateLimitResponse(
  status: number | undefined,
): AuthActionState | null {
  return status === 429
    ? { status: "error", message: AUTH_RATE_LIMIT_MESSAGE }
    : null
}
