import { safeRedirectPath } from "./auth-utils"

export const GOOGLE_TRANSACTION_COOKIE = "mv2_web_google_transaction"
export const GOOGLE_TRANSACTION_MAX_AGE = 10 * 60

export type GoogleTransaction = {
  state: string
  next: string
  createdAt: number
  sessionHash?: string
}

export function googleCallbackUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "")
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && url.hostname === "localhost")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/auth/google/callback"
    )
      return null
    return url.toString()
  } catch {
    return null
  }
}

export function googleAuthorizationUrl(value: string, callback: string) {
  try {
    const url = new URL(value)
    const state = url.searchParams.get("state")
    if (
      url.origin !== "https://accounts.google.com" ||
      url.pathname !== "/o/oauth2/v2/auth" ||
      url.username ||
      url.password ||
      url.searchParams.get("redirect_uri") !== callback ||
      !state ||
      !/^[a-f0-9]{64}$/.test(state)
    )
      return null
    return { location: url.toString(), state }
  } catch {
    return null
  }
}

export function googleNextPath(value: string | null | undefined) {
  const next = safeRedirectPath(value, "/account")
  if (next === "/auth/vendor") return next
  return new URL(next, "https://marketplace.invalid").pathname.startsWith(
    "/auth/",
  )
    ? "/account"
    : next
}

export function readGoogleTransaction(
  value: string | undefined,
  state: string | null,
  now = Date.now(),
): GoogleTransaction | null {
  if (!value || !state) return null
  try {
    const data: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    )
    if (
      !data ||
      typeof data !== "object" ||
      !("state" in data) ||
      data.state !== state ||
      !/^[a-f0-9]{64}$/.test(state) ||
      !("createdAt" in data) ||
      typeof data.createdAt !== "number" ||
      data.createdAt > now ||
      now - data.createdAt > GOOGLE_TRANSACTION_MAX_AGE * 1000 ||
      !("next" in data) ||
      typeof data.next !== "string" ||
      ("sessionHash" in data &&
        (typeof data.sessionHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(data.sessionHash)))
    )
      return null
    return {
      state,
      createdAt: data.createdAt,
      next: googleNextPath(data.next),
      ...("sessionHash" in data
        ? { sessionHash: data.sessionHash as string }
        : {}),
    }
  } catch {
    return null
  }
}

// This only chooses the next API call; customer.retrieve still authorizes the session.
export function tokenHasCustomer(token: string) {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    )
    return (
      !!payload &&
      typeof payload === "object" &&
      "actor_type" in payload &&
      payload.actor_type === "customer" &&
      "actor_id" in payload &&
      typeof payload.actor_id === "string" &&
      !!payload.actor_id
    )
  } catch {
    return false
  }
}

export function sameGoogleAuthIdentity(first: string, second: string) {
  const identity = (token: string): string | null => {
    try {
      const payload: unknown = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      )
      return payload &&
        typeof payload === "object" &&
        "auth_identity_id" in payload &&
        typeof payload.auth_identity_id === "string" &&
        payload.auth_identity_id
        ? payload.auth_identity_id
        : null
    } catch {
      return null
    }
  }
  const firstId = identity(first)
  return !!firstId && firstId === identity(second)
}

export function googleFeedback(code: string | undefined): string | undefined {
  switch (code) {
    case "cancelled":
      return "Cancelaste el acceso con Google. Puedes volver a intentarlo."
    case "expired":
      return "El intento de acceso venció o no es válido. Vuelve a intentarlo."
    case "link_required":
      return "Para vincular Google, inicia sesión una vez con el método actual de tu cuenta."
    case "failed":
      return "No pudimos completar el acceso con Google. Inténtalo nuevamente."
    case "session_changed":
      return "La sesión cambió. Vuelve a iniciar la vinculación de Google."
    default:
      return undefined
  }
}
