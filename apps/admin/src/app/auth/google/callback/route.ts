import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createAdminSdk } from "@/lib/auth-sdk";
import { completeAdminLogin } from "@/lib/auth-login";
import { ADMIN_SESSION_COOKIE, safeRedirectPath, unpackSecret } from "@/lib/auth-utils";
import { GOOGLE_ATTEMPT_COOKIE, completeGoogleAuthentication, validGoogleAttempt, validGoogleLinkSession, type GoogleAttempt } from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  const store = await cookies();
  const attempt = unpackSecret<GoogleAttempt>(store.get(GOOGLE_ATTEMPT_COOKIE)?.value);
  store.delete(GOOGLE_ATTEMPT_COOKIE);
  const state = request.nextUrl.searchParams.get("state");
  if (!validGoogleAttempt(attempt, state)) redirect("/login?google=invalid");
  const next = safeRedirectPath(attempt.next, "/dashboard");
  const login = (reason: string, destination = next) => `/login?google=${reason}&next=${encodeURIComponent(destination)}`;
  if (request.nextUrl.searchParams.has("error")) redirect(login("cancelled"));
  const code = request.nextUrl.searchParams.get("code");
  const sdk = createAdminSdk();
  if (!code || !sdk) redirect(login("invalid"));
  let result;
  try {
    const existingToken = attempt.link ? store.get(ADMIN_SESSION_COOKIE)?.value : undefined;
    if (!validGoogleLinkSession(attempt, existingToken)) throw new Error("session_expired");
    result = await completeGoogleAuthentication(sdk, createAdminSdk, code, attempt.state, existingToken);
  } catch {
    redirect(login("failed"));
  }
  if (typeof result === "object" && "status" in result) {
    redirect(login("link_required", `/auth/google/link?next=${encodeURIComponent(next)}`));
  }
  const outcome = await completeAdminLogin(result, "", next);
  redirect(login(outcome.status === "mfa_required" ? "mfa" : "failed"));
}

