import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createVendorSdk } from "@/lib/auth-sdk";
import { completeVendorLogin } from "@/lib/auth-login";
import { VENDOR_SESSION_COOKIE, safeRedirectPath, unpackSecret } from "@/lib/auth-utils";
import { GOOGLE_ATTEMPT_COOKIE, completeGoogleAuthentication, validGoogleAttempt, validGoogleLinkSession, type GoogleAttempt } from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  const store = await cookies();
  const attempt = unpackSecret<GoogleAttempt>(store.get(GOOGLE_ATTEMPT_COOKIE)?.value);
  store.delete(GOOGLE_ATTEMPT_COOKIE);
  const state = request.nextUrl.searchParams.get("state");
  if (!validGoogleAttempt(attempt, state)) redirect("/seller/login?google=invalid");
  const next = safeRedirectPath(attempt.next, "/seller");
  const login = (reason: string, destination = next) => `/seller/login?google=${reason}&next=${encodeURIComponent(destination)}`;
  if (request.nextUrl.searchParams.has("error")) redirect(login("cancelled"));
  const code = request.nextUrl.searchParams.get("code");
  const sdk = createVendorSdk();
  if (!code || !sdk) redirect(login("invalid"));
  let result;
  try {
    const existingToken = attempt.link ? store.get(VENDOR_SESSION_COOKIE)?.value : undefined;
    if (!validGoogleLinkSession(attempt, existingToken)) throw new Error("session_expired");
    result = await completeGoogleAuthentication(sdk, createVendorSdk, code, attempt.state, existingToken);
  } catch {
    redirect(login("failed"));
  }
  if (typeof result === "object" && "status" in result) {
    redirect(login("link_required", `/auth/google/link?next=${encodeURIComponent(next)}`));
  }
  const outcome = await completeVendorLogin(result, "", next);
  redirect(login(outcome.status === "mfa_required" ? "mfa" : "failed"));
}

