import Medusa, { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { adoptCustomerCart, clearCartSession } from "@/features/cart/session"

import {
  WEB_MFA_COOKIE,
  WEB_RESET_COOKIE,
  WEB_SESSION_COOKIE,
  WEB_VERIFICATION_CODE_COOKIE,
  WEB_VERIFICATION_COOKIE,
  jwtMaxAge,
  packSecret,
  unpackSecret,
} from "@/lib/auth-utils"
import { validateStorefrontEnvironment } from "@/lib/storefront-config"

type MfaSecret = { token: string; challengeId: string; methods: string[] }
type VerificationSecret = { token: string; email: string }
type ResetSecret = { token: string; email?: string }

const configuration = validateStorefrontEnvironment({
  NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

export function createCustomerSdk(token?: string) {
  if (configuration.status !== "valid") return null

  return new Medusa({
    baseUrl: configuration.config.baseUrl,
    publishableKey: configuration.config.publishableKey,
    debug: false,
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

const secureCookie = process.env.NODE_ENV === "production"

export async function setCustomerSession(
  token: string,
  preserveVerificationCode = false,
  { preserveReceipt = false }: { preserveReceipt?: boolean } = {},
) {
  const store = await cookies()
  const sdk = createCustomerSdk(token)
  if (!sdk) throw new Error("El servicio de cuenta no está disponible.")
  const { customer } = await sdk.store.customer.retrieve()
  await adoptCustomerCart(store, sdk.store.cart, customer.id, {
    preserveReceipt,
  })
  store.set(WEB_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: jwtMaxAge(token),
  })
  store.delete(WEB_MFA_COOKIE)
  store.delete(WEB_RESET_COOKIE)
  store.delete(WEB_VERIFICATION_COOKIE)
  if (!preserveVerificationCode) store.delete(WEB_VERIFICATION_CODE_COOKIE)
}

export async function clearCustomerSession() {
  const store = await cookies()
  clearCartSession(store)
  store.delete(WEB_SESSION_COOKIE)
  store.delete(WEB_MFA_COOKIE)
  store.delete(WEB_RESET_COOKIE)
  store.delete(WEB_VERIFICATION_COOKIE)
  store.delete(WEB_VERIFICATION_CODE_COOKIE)
}

export async function getCustomerSessionToken() {
  return (await cookies()).get(WEB_SESSION_COOKIE)?.value
}

export async function setMfaSecret(secret: MfaSecret) {
  ;(await cookies()).set(WEB_MFA_COOKIE, packSecret(secret), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
  })
}

export async function getMfaSecret() {
  return unpackSecret<MfaSecret>((await cookies()).get(WEB_MFA_COOKIE)?.value)
}

export async function clearMfaSecret() {
  ;(await cookies()).delete(WEB_MFA_COOKIE)
}

export async function setVerificationSecret(secret: VerificationSecret) {
  ;(await cookies()).set(WEB_VERIFICATION_COOKIE, packSecret(secret), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60,
  })
}

export async function getVerificationSecret() {
  return unpackSecret<VerificationSecret>(
    (await cookies()).get(WEB_VERIFICATION_COOKIE)?.value,
  )
}

export async function getVerificationCode() {
  return (await cookies()).get(WEB_VERIFICATION_CODE_COOKIE)?.value
}

export async function clearVerificationSecrets() {
  const store = await cookies()
  store.delete(WEB_VERIFICATION_COOKIE)
  store.delete(WEB_VERIFICATION_CODE_COOKIE)
}

export async function getResetSecret() {
  return unpackSecret<ResetSecret>((await cookies()).get(WEB_RESET_COOKIE)?.value)
}

export async function clearResetSecret() {
  ;(await cookies()).delete(WEB_RESET_COOKIE)
}

export async function getCurrentCustomer(): Promise<HttpTypes.StoreCustomer | null> {
  const token = await getCustomerSessionToken()
  if (!token) return null

  const sdk = createCustomerSdk(token)
  return retrieveCustomerSession(sdk?.store.customer)
}

export async function retrieveCustomerSession(
  client: Pick<Medusa["store"]["customer"], "retrieve"> | undefined,
): Promise<HttpTypes.StoreCustomer | null> {
  if (!client) throw new Error("El servicio de cuenta no está disponible.")

  try {
    return (await client.retrieve()).customer
  } catch (error) {
    if (error instanceof FetchError && (error.status === 401 || error.status === 403)) {
      return null
    }
    throw error
  }
}

export function isAuthConfigurationMissing() {
  return configuration.status !== "valid"
}
