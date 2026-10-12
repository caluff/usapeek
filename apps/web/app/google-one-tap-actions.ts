"use server"

import type {
  GoogleOneTapLoginInput,
  GoogleOneTapTransactionResponse,
} from "@usapeek/api/auth-contracts"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { createCustomerSdk, getCurrentCustomer } from "@/lib/auth-sdk"
import type { AuthActionState } from "@/lib/auth-utils"
import { finishCustomerGoogleSignIn } from "@/lib/customer-google-sign-in"
import {
  ONE_TAP_MAX_AGE,
  consumeOneTapTransaction,
  isOneTapCredential,
  oneTapCookieName,
} from "@/lib/google-one-tap"

export async function startCustomerOneTapAction() {
  try {
    if (await getCurrentCustomer()) return null
    const sdk = createCustomerSdk()
    if (!sdk) return null
    const transaction = await sdk.client.fetch<GoogleOneTapTransactionResponse>(
      "/auth/google/one-tap/transaction",
      { method: "POST", body: {}, cache: "no-store" },
    )
    const cookieName = oneTapCookieName(transaction.nonce)
    if (!cookieName) return null
    ;(await cookies()).set(cookieName, transaction.transaction_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ONE_TAP_MAX_AGE,
    })
    return { client_id: transaction.client_id, nonce: transaction.nonce }
  } catch {
    return null
  }
}

export async function completeCustomerOneTapAction(
  credential: unknown,
  nonce: unknown,
): Promise<AuthActionState> {
  const store = await cookies()
  const transactionToken = consumeOneTapTransaction(store, nonce)
  if (!transactionToken || !isOneTapCredential(credential)) {
    return {
      status: "error",
      message:
        "El intento de acceso venció. Usa el botón Iniciar sesión para volver a intentarlo.",
    }
  }
  let destination: string
  try {
    // A late prompt must not replace a session opened in another tab.
    if (await getCurrentCustomer()) return { status: "success" }
    const sdk = createCustomerSdk()
    if (!sdk) throw new Error("Authentication unavailable")
    const body: GoogleOneTapLoginInput = {
      id_token: credential,
      transaction_token: transactionToken,
    }
    const result = await sdk.auth.login("customer", "google", body)
    if (typeof result !== "string" && "location" in result)
      throw new Error("Unexpected Google redirect")
    destination = await finishCustomerGoogleSignIn(result, "/")
  } catch {
    return {
      status: "error",
      message:
        "No pudimos iniciar sesión con Google. Usa el botón Iniciar sesión para volver a intentarlo.",
    }
  }
  redirect(destination)
}
