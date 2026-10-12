import { createHash } from "node:crypto";
import type { CompleteGoogleAuthInput, CompleteGoogleAuthResponse } from "@usapeek/api/auth-contracts";
import type Medusa from "@medusajs/js-sdk";
import type { AuthCallbackResponse } from "@medusajs/js-sdk";

export type GoogleAttempt = { state: string; next: string; link: boolean; createdAt: number; sessionHash?: string };
export const GOOGLE_ATTEMPT_COOKIE = "mv2_vendor_google_attempt";

export function googleAuthorizationUrl(value: string, callbackUrl: string) {
  try {
    const url = new URL(value);
    const state = url.searchParams.get("state");
    if (url.origin !== "https://accounts.google.com" || url.username || url.password || url.pathname !== "/o/oauth2/v2/auth" || url.searchParams.get("redirect_uri") !== callbackUrl || url.searchParams.get("response_type") !== "code" || !state) return null;
    return { location: url.toString(), state };
  } catch { return null; }
}

export function validGoogleAttempt(attempt: GoogleAttempt | null, state: string | null, now = Date.now()): attempt is GoogleAttempt {
  return Boolean(attempt && typeof attempt.createdAt === "number" && now - attempt.createdAt >= 0 && now - attempt.createdAt <= 600_000 && typeof attempt.state === "string" && state && attempt.state === state && typeof attempt.next === "string" && typeof attempt.link === "boolean" && (!attempt.link || (typeof attempt.sessionHash === "string" && /^[a-f0-9]{64}$/.test(attempt.sessionHash))));
}

export function googleSessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validGoogleLinkSession(attempt: GoogleAttempt, token: string | undefined) {
  return !attempt.link || Boolean(token && googleSessionHash(token) === attempt.sessionHash);
}

export function googleCallbackUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== "/auth/google/callback") return null;
    return url.toString();
  } catch { return null; }
}

export function googleFeedback(reason: string | undefined) {
  if (reason === "link_required") return "Para vincular Google, primero inicia sesión con el método actual de tu cuenta. Después podrás confirmar la vinculación.";
  if (reason === "cancelled") return "Cancelaste el acceso con Google. Puedes intentarlo nuevamente.";
  if (reason === "invalid") return "El intento de acceso venció o no es válido. Vuelve a continuar con Google.";
  if (reason === "failed") return "No pudimos completar el acceso con Google. Verifica que tu cuenta tenga acceso e inténtalo nuevamente.";
  return undefined;
}

function authIdentityId(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { auth_identity_id?: unknown };
    return typeof payload.auth_identity_id === "string" ? payload.auth_identity_id : null;
  } catch { return null; }
}

// Refresh the canonical identity so linking preserves MFA and verification.
export async function completeGoogleAuthentication(
  sdk: Medusa,
  createSdk: (token: string) => Medusa | null,
  code: string,
  state: string,
  existingToken?: string,
): Promise<AuthCallbackResponse | { status: "link_required" }> {
  const result = await sdk.auth.callback("member", "google", { code, state });
  if (typeof result !== "string") {
    if (existingToken && (!authIdentityId(result.token) || authIdentityId(result.token) !== authIdentityId(existingToken))) throw new Error("google_link_requires_complete_authentication");
    return result;
  }
  const authenticated = createSdk(result);
  if (!authenticated) throw new Error("configuration_missing");
  const completion = await authenticated.client.fetch<CompleteGoogleAuthResponse>("/auth/google/complete", {
    method: "POST",
    body: { actor_type: "member", ...(existingToken ? { existing_token: existingToken } : {}) } satisfies CompleteGoogleAuthInput,
  });
  if (completion.status === "link_required") return completion;
  const canonical = createSdk(completion.token);
  if (!canonical) throw new Error("configuration_missing");
  const refreshed = await canonical.auth.refresh();
  if ("mfa_required" in refreshed || "verification_required" in refreshed) return refreshed;
  return refreshed.token;
}

