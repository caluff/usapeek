import { randomBytes } from "node:crypto"
import type { VendorSessionIssueResponse } from "@usapeek/api/auth-contracts"
import { redirect } from "next/navigation"
import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"
import { vendorSessionCallbackUrl, vendorSessionDocument } from "@/lib/vendor-session"

export async function GET() {
  const token = await getCustomerSessionToken()
  if (!token) redirect("/login?next=%2Fauth%2Fvendor")
  const callback = vendorSessionCallbackUrl(process.env.NEXT_PUBLIC_VENDOR_URL)
  const sdk = createCustomerSdk(token)
  if (!callback || !sdk) redirect("/account/sell?vendor=unavailable")
  let result: VendorSessionIssueResponse
  try {
    result = await sdk.client.fetch<VendorSessionIssueResponse>("/auth/vendor-session/issue", { method: "POST", body: {}, cache: "no-store" })
  } catch { redirect("/account/sell?vendor=unavailable") }
  const nonce = randomBytes(16).toString("hex")
  return new Response(vendorSessionDocument(callback, result.code, nonce), { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "strict-origin",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${new URL(callback).origin}; base-uri 'none'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
  } })
}
