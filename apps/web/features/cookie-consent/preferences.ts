export const COOKIE_CONSENT_STORAGE_KEY = "usapeek:cookie-consent"
export const COOKIE_CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000

export type CookiePreferences = {
  version: 1
  googleOneTap: boolean
  expiresAt: number
}

export function createCookiePreferences(
  googleOneTap: boolean,
  now = Date.now(),
): CookiePreferences {
  return { version: 1, googleOneTap, expiresAt: now + COOKIE_CONSENT_MAX_AGE }
}

export function readCookiePreferences(
  raw: string | null | undefined,
  now = Date.now(),
): CookiePreferences | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("googleOneTap" in value) ||
      typeof value.googleOneTap !== "boolean" ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + COOKIE_CONSENT_MAX_AGE
    )
      return null
    return {
      version: 1,
      googleOneTap: value.googleOneTap,
      expiresAt: value.expiresAt,
    }
  } catch {
    return null
  }
}
