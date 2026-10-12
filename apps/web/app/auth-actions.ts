"use server"

import { FetchError, type AuthLoginResponse } from "@medusajs/js-sdk"
import { redirect } from "next/navigation"

import {
  clearCustomerSession,
  clearMfaSecret,
  clearResetSecret,
  clearVerificationSecrets,
  createCustomerSdk,
  getMfaSecret,
  getResetSecret,
  getVerificationCode,
  getVerificationSecret,
  isAuthConfigurationMissing,
  setCustomerSession,
  setMfaSecret,
  setVerificationSecret,
} from "@/lib/auth-sdk"
import {
  type AuthActionState,
  normalizeEmail,
  safeExternalAuthUrl,
  safeRedirectPath,
  validateCredentials,
} from "@/lib/auth-utils"
import { completeCustomerMfa } from "@/lib/customer-mfa"
import {
  AUTH_RATE_LIMIT_MESSAGE,
  REGISTRATION_ERROR,
  authHoneypotResponse,
  authRateLimitResponse,
  passwordRecoveryResponse,
} from "@/lib/auth-form-protection"

const INVALID_CREDENTIALS =
  "No pudimos iniciar sesión con esos datos. Revisa el correo y la contraseña."

function rateLimitError(error: unknown) {
  return authRateLimitResponse(error instanceof FetchError ? error.status : undefined)
}

function customerLoginError(
  error: unknown,
  stage: "credentials" | "profile",
): AuthActionState {
  const status = error instanceof FetchError ? error.status : undefined

  console.error("Customer login failed", JSON.stringify({
    stage,
    status,
    errorType: error instanceof Error ? error.name : "UnknownError",
  }))

  if (status === 401 || status === 403) {
    return { status: "error", message: INVALID_CREDENTIALS }
  }

  return {
    status: "error",
    message: status === 429
      ? AUTH_RATE_LIMIT_MESSAGE
      : "No pudimos conectar con el servicio de acceso o cargar tu perfil. Inténtalo de nuevo en unos minutos.",
  }
}

function configurationError(): AuthActionState {
  return {
    status: "error",
    message:
      "La autenticación no está configurada. Revisa NEXT_PUBLIC_MEDUSA_BACKEND_URL y NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.",
  }
}

async function completeCustomerLogin(
  result: AuthLoginResponse,
  email: string,
  next: string,
): Promise<AuthActionState> {
  if (typeof result === "string") {
    const authenticatedSdk = createCustomerSdk(result)
    if (!authenticatedSdk) return configurationError()

    try {
      const destination = safeRedirectPath(next, "/account")
      await setCustomerSession(result, destination === "/account/sell", {
        preserveReceipt: destination === "/checkout/confirmation",
      })
    } catch (error) {
      return customerLoginError(error, "profile")
    }

    redirect(safeRedirectPath(next, "/account"))
  }

  if ("verification_required" in result) {
    await setVerificationSecret({ token: result.token, email })
    const verificationSdk = createCustomerSdk(result.token)
    try {
      await verificationSdk?.auth.verification.request({
        entity_id: email,
        entity_type: "email",
        metadata: { actor_type: "customer" },
      })
    } catch {
      // A previous valid code may still exist. The verification page offers a retry.
    }
    redirect(`/verify-email?next=${encodeURIComponent(safeRedirectPath(next, "/account"))}`)
  }

  if ("mfa_required" in result) {
    await setMfaSecret({
      token: result.token,
      challengeId: result.mfa_challenge.id,
      methods: result.mfa_challenge.methods,
    })
    return {
      status: "mfa_required",
      message: "Confirma el segundo factor para continuar.",
      mfaMethods: result.mfa_challenge.methods,
    }
  }

  const externalUrl = safeExternalAuthUrl(result.location)
  return externalUrl
    ? {
        status: "external_redirect",
        message: "El proveedor requiere completar el acceso en otra página.",
        externalUrl,
      }
    : { status: "error", message: "El proveedor devolvió una redirección no válida." }
}

export async function loginCustomerAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"))
  const password = String(formData.get("password") ?? "")
  const next = safeRedirectPath(formData.get("next"), "/account")
  const fieldErrors = validateCredentials(email, password)

  if (Object.keys(fieldErrors).length) {
    return { status: "error", message: "Revisa los campos indicados.", fieldErrors }
  }

  const sdk = createCustomerSdk()
  if (!sdk) return configurationError()

  try {
    const result = await sdk.auth.login("customer", "emailpass", {
      email,
      password,
    })
    return completeCustomerLogin(result, email, next)
  } catch (error) {
    return customerLoginError(error, "credentials")
  }
}

export async function verifyCustomerMfaAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "").trim()
  const next = safeRedirectPath(formData.get("next"), "/account")
  const secret = await getMfaSecret()

  if (!code || code.length > 128) {
    return {
      status: "mfa_required",
      message: "Ingresa un código válido.",
      fieldErrors: { code: "El código es obligatorio." },
      mfaMethods: secret?.methods,
    }
  }

  if (!secret) {
    return {
      status: "error",
      message: "El desafío venció. Inicia sesión nuevamente.",
    }
  }

  const method = String(formData.get("method") ?? secret.methods[0] ?? "totp")
  if (!secret.methods.includes(method)) {
    return { status: "error", message: "El método de verificación no es válido." }
  }

  const sdk = createCustomerSdk(secret.token)
  if (!sdk) return configurationError()

  const result = await completeCustomerMfa({
    verifyChallenge: () =>
      sdk.auth.mfa.verifyChallenge(secret.challengeId, { method, code }),
    setSession: async (token) => {
      await setCustomerSession(token, false, {
        preserveReceipt: next === "/checkout/confirmation",
      })
    },
    clearChallenge: clearMfaSecret,
  })
  if (result === "invalid_code") {
    return {
      status: "mfa_required",
      message: "No pudimos validar el código. Inténtalo nuevamente.",
      mfaMethods: secret.methods,
    }
  }
  if (result === "session_unavailable")
    redirect(`/login?reason=session_unavailable&next=${encodeURIComponent(next)}`)

  redirect(next)
}

export async function registerCustomerAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const blocked = authHoneypotResponse(formData, "register")
  if (blocked) return blocked

  const firstName = String(formData.get("firstName") ?? "").trim()
  const lastName = String(formData.get("lastName") ?? "").trim()
  const email = normalizeEmail(formData.get("email"))
  const password = String(formData.get("password") ?? "")
  const fieldErrors = validateCredentials(email, password)

  if (!firstName || firstName.length > 100) {
    fieldErrors.firstName = "Ingresa tu nombre."
  }
  if (!lastName || lastName.length > 100) {
    fieldErrors.lastName = "Ingresa tu apellido."
  }
  if (Object.keys(fieldErrors).length) {
    return { status: "error", message: "Revisa los campos indicados.", fieldErrors }
  }

  const sdk = createCustomerSdk()
  if (!sdk) return configurationError()

  let registrationToken: string | null = null
  let existingCustomerToken: string | null = null

  try {
    registrationToken = await sdk.auth.register("customer", "emailpass", {
      email,
      password,
    })
  } catch (error) {
    const rateLimited = rateLimitError(error)
    if (rateLimited) return rateLimited
    const identityMayExist =
      error instanceof FetchError &&
      (error.status === 400 || error.status === 401 || error.status === 409)
    if (!identityMayExist) {
      return {
        status: "error",
        message: REGISTRATION_ERROR,
      }
    }

    try {
      const existing = await sdk.auth.login("customer", "emailpass", {
        email,
        password,
      })
      if (typeof existing !== "string") {
        return completeCustomerLogin(existing, email, "/account")
      }

      const existingSdk = createCustomerSdk(existing)
      if (!existingSdk) return configurationError()
      let hasCustomerProfile = false
      try {
        await existingSdk.store.customer.retrieve()
        hasCustomerProfile = true
      } catch (error) {
        if (rateLimitError(error)) throw error
        registrationToken = existing
      }
      if (hasCustomerProfile) {
        existingCustomerToken = existing
      }
    } catch (error) {
      return rateLimitError(error) ?? {
        status: "error",
        message: REGISTRATION_ERROR,
      }
    }
  }

  if (existingCustomerToken) {
    try {
      await setCustomerSession(existingCustomerToken)
    } catch (error) {
      return customerLoginError(error, "profile")
    }
    redirect("/account")
  }

  if (!registrationToken) {
    return { status: "error", message: REGISTRATION_ERROR }
  }

  try {
    const profileSdk = createCustomerSdk(registrationToken)
    if (!profileSdk) return configurationError()
    await profileSdk.store.customer.create({
      email,
      first_name: firstName,
      last_name: lastName,
    })

    const loginResult = await sdk.auth.login("customer", "emailpass", {
      email,
      password,
    })
    return completeCustomerLogin(loginResult, email, "/account")
  } catch (error) {
    return rateLimitError(error) ?? {
      status: "error",
      message: REGISTRATION_ERROR,
    }
  }
}

export async function forgotCustomerPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const blocked = authHoneypotResponse(formData, "forgot-password")
  if (blocked) return blocked

  const email = normalizeEmail(formData.get("email"))
  if (!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email) || email.length > 254) {
    return {
      status: "error",
      message: "Revisa el correo indicado.",
      fieldErrors: { email: "Ingresa un correo electrónico válido." },
    }
  }

  const sdk = createCustomerSdk()
  if (!sdk || isAuthConfigurationMissing()) return configurationError()

  try {
    await sdk.auth.resetPassword("customer", "emailpass", {
      identifier: email,
      metadata: { actor_type: "customer" },
    })
  } catch {
    // The response remains identical whether the account exists or delivery fails.
  }

  return passwordRecoveryResponse()
}

export async function resetCustomerPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "")
  const confirmation = String(formData.get("confirmation") ?? "")
  const secret = await getResetSecret()

  if (password.length < 8 || password.length > 256) {
    return {
      status: "error",
      message: "Revisa la contraseña.",
      fieldErrors: { password: "Usa entre 8 y 256 caracteres." },
    }
  }
  if (password !== confirmation) {
    return { status: "error", message: "Las contraseñas no coinciden." }
  }
  if (!secret?.token) {
    return {
      status: "error",
      message: "El enlace no es válido o ya venció. Solicita uno nuevo.",
    }
  }

  const sdk = createCustomerSdk()
  if (!sdk) return configurationError()

  try {
    await sdk.auth.updateProvider(
      "customer",
      "emailpass",
      { password },
      secret.token,
    )
    await clearResetSecret()
    return {
      status: "success",
      message: "Contraseña actualizada. Ya puedes iniciar sesión.",
    }
  } catch (error) {
    return rateLimitError(error) ?? {
      status: "error",
      message: "El enlace no es válido o ya venció. Solicita uno nuevo.",
    }
  }
}

export async function confirmCustomerEmailAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const suppliedCode = String(formData.get("code") ?? "").trim()
  const code = suppliedCode || (await getVerificationCode()) || ""
  const secret = await getVerificationSecret()
  const sdk = createCustomerSdk(secret?.token)

  if (!code || code.length > 512) {
    return {
      status: "error",
      message: "Ingresa el código recibido por correo.",
      fieldErrors: { code: "El código es obligatorio." },
    }
  }
  if (!sdk) return configurationError()

  try {
    await sdk.auth.verification.confirm({ code })
    await clearVerificationSecrets()
    return {
      status: "success",
      message: "Correo verificado. Inicia sesión para continuar.",
    }
  } catch (error) {
    return rateLimitError(error) ?? {
      status: "error",
      message: "El código no es válido o ya venció.",
    }
  }
}

export async function resendCustomerVerificationAction(): Promise<AuthActionState> {
  const secret = await getVerificationSecret()
  const sdk = createCustomerSdk(secret?.token)
  if (!secret || !sdk) {
    return { status: "error", message: "Inicia sesión nuevamente para pedir otro código." }
  }

  try {
    await sdk.auth.verification.request({
      entity_id: secret.email,
      entity_type: "email",
      metadata: { actor_type: "customer" },
    })
    return { status: "success", message: "Enviamos un nuevo código de verificación." }
  } catch (error) {
    return rateLimitError(error) ?? { status: "error", message: "No pudimos enviar otro código ahora." }
  }
}

export async function logoutCustomerAction() {
  const sdk = createCustomerSdk()
  try {
    await sdk?.auth.logout()
  } finally {
    await clearCustomerSession()
  }
  redirect("/")
}
