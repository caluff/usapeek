import type { AuthCallbackResponse } from "@medusajs/js-sdk"
import type { CompleteGoogleAuthResponse } from "@usapeek/api/auth-contracts"

import {
  createCustomerSdk,
  setCustomerSession,
  setMfaSecret,
  setVerificationSecret,
} from "./auth-sdk"
import { sameGoogleAuthIdentity, tokenHasCustomer } from "./google-auth"

const SESSION_SERVICES = {
  createCustomerSdk,
  setCustomerSession,
  setMfaSecret,
  setVerificationSecret,
}

async function resolveCustomerGoogleToken(
  token: string,
  existingToken: string | undefined,
  services: typeof SESSION_SERVICES,
) {
  if (!existingToken && tokenHasCustomer(token)) return token
  const sdk = services.createCustomerSdk(token)
  if (!sdk) throw new Error("Authentication unavailable")
  const result = await sdk.client.fetch<CompleteGoogleAuthResponse>(
    "/auth/google/complete",
    {
      method: "POST",
      body: {
        actor_type: "customer",
        ...(existingToken ? { existing_token: existingToken } : {}),
      },
    },
  )
  if (!result || typeof result !== "object" || !("status" in result))
    throw new Error("Invalid completion response")
  if (result.status === "link_required") return null
  if (
    result.status !== "complete" ||
    !("token" in result) ||
    typeof result.token !== "string"
  )
    throw new Error("Invalid completion response")
  const canonicalSdk = services.createCustomerSdk(result.token)
  if (!canonicalSdk) throw new Error("Authentication unavailable")
  const refreshed = await canonicalSdk.auth.refresh()
  return "mfa_required" in refreshed || "verification_required" in refreshed
    ? refreshed
    : refreshed.token
}

export async function finishCustomerGoogleSignIn(
  response: AuthCallbackResponse,
  next: string,
  existingToken?: string,
  services = SESSION_SERVICES,
) {
  const loginPath = (code: string) =>
    `/login?google=${code}&next=${encodeURIComponent(next)}`
  if (
    typeof response !== "string" &&
    existingToken &&
    !sameGoogleAuthIdentity(response.token, existingToken)
  )
    throw new Error("Account conflict")
  const result =
    typeof response === "string"
      ? await resolveCustomerGoogleToken(response, existingToken, services)
      : response
  if (result === null) {
    return `/login?google=link_required&next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`
  }
  if (typeof result === "string") {
    const authenticated = services.createCustomerSdk(result)
    if (!authenticated) throw new Error("Authentication unavailable")
    await authenticated.store.customer.retrieve()
    await services.setCustomerSession(result, next === "/account/sell", {
      preserveReceipt: next === "/checkout/confirmation",
    })
    return next
  }
  if ("mfa_required" in result) {
    await services.setMfaSecret({
      token: result.token,
      challengeId: result.mfa_challenge.id,
      methods: result.mfa_challenge.methods,
    })
    return loginPath("mfa_required")
  }
  const email = result.verification?.entity_id
  if (!email) throw new Error("Verification email unavailable")
  await services.setVerificationSecret({ token: result.token, email })
  return `/verify-email?next=${encodeURIComponent(next)}`
}
