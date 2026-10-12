import type { VendorSessionConsumeResponse } from "@usapeek/api/auth-contracts";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createVendorSdk, setVendorVerification } from "@/lib/auth-sdk";
import { finishVendorToken } from "@/lib/auth-login";
import { STOREFRONT_SESSION_COOKIE, storefrontSessionCode, trustedStorefrontOrigin } from "@/lib/storefront-session";
import { sellerApplicationUrl } from "@/lib/storefront-url";

export async function POST(request: NextRequest) {
  if (!trustedStorefrontOrigin(request.headers.get("origin"), process.env.NEXT_PUBLIC_STOREFRONT_URL)) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  const application = sellerApplicationUrl()!;
  const failure = `${application}?vendor=unavailable`;
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return NextResponse.redirect(failure, 303);
  const code = storefrontSessionCode(await request.text());
  if (!code) return NextResponse.redirect(failure, 303);
  // A 303 returns to this origin with GET before writing the normal seller session.
  // The short-lived HttpOnly cookie keeps the code out of URLs and browser history.
  const response = NextResponse.redirect(new URL("/auth/storefront", request.url), 303);
  response.cookies.set(STOREFRONT_SESSION_COOKIE, code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/auth/storefront", maxAge: 60 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET() {
  const store = await cookies();
  const code = store.get(STOREFRONT_SESSION_COOKIE)?.value;
  store.set(STOREFRONT_SESSION_COOKIE, "", { path: "/auth/storefront", maxAge: 0 });
  const application = sellerApplicationUrl();
  const failure = application ? `${application}?vendor=unavailable` : "/seller/login";
  const sdk = createVendorSdk();
  if (!code || !/^[a-f0-9]{64}$/.test(code) || !sdk) redirect(failure);
  let result: VendorSessionConsumeResponse;
  try {
    result = await sdk.client.fetch<VendorSessionConsumeResponse>("/auth/vendor-session/consume", { method: "POST", body: { code }, cache: "no-store" });
  } catch { redirect(failure); }
  if (result.status === "verification_required") {
    await setVendorVerification({ token: result.token, email: result.email });
    try {
      await createVendorSdk(result.token)?.auth.verification.request({ entity_id: result.email, entity_type: "email", metadata: { actor_type: "member" } });
    } catch { /* The verification page supports requesting a new code. */ }
    redirect("/seller/verify-email?next=%2Fseller");
  }
  await finishVendorToken(result.token, "/seller");
  redirect(failure);
}
