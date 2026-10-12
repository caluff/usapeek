import { createHash } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"
import { finishCustomerGoogleSignIn } from "@/lib/customer-google-sign-in"
import {
  GOOGLE_TRANSACTION_COOKIE,
  readGoogleTransaction,
} from "@/lib/google-auth"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const store = await cookies()
  const transaction = readGoogleTransaction(
    store.get(GOOGLE_TRANSACTION_COOKIE)?.value,
    url.searchParams.get("state"),
  )
  store.delete(GOOGLE_TRANSACTION_COOKIE)
  if (!transaction) redirect("/login?google=expired")
  const loginPath = (code: string) =>
    `/login?google=${code}&next=${encodeURIComponent(transaction.next)}`
  if (url.searchParams.has("error"))
    redirect(
      loginPath(
        url.searchParams.get("error") === "access_denied"
          ? "cancelled"
          : "failed",
      ),
    )
  const code = url.searchParams.get("code")
  if (!code || code.length > 4096) redirect(loginPath("expired"))

  let destination = transaction.next
  try {
    let existingToken: string | undefined
    if (transaction.sessionHash) {
      existingToken = await getCustomerSessionToken()
      if (
        !existingToken ||
        createHash("sha256").update(existingToken).digest("hex") !==
          transaction.sessionHash
      ) {
        destination = loginPath("session_changed")
      }
    }
    if (destination === transaction.next) {
      const sdk = createCustomerSdk()
      if (!sdk) throw new Error("Authentication unavailable")
      const result = await sdk.auth.callback("customer", "google", {
        code,
        state: transaction.state,
      })
      destination = await finishCustomerGoogleSignIn(
        result,
        transaction.next,
        existingToken,
      )
    }
  } catch {
    destination = loginPath("failed")
  }
  redirect(destination)
}
