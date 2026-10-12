"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSdk } from "@/lib/auth-sdk";
import { ADMIN_SESSION_COOKIE, packSecret, safeRedirectPath, type AuthActionState } from "@/lib/auth-utils";
import { GOOGLE_ATTEMPT_COOKIE, googleAuthorizationUrl, googleCallbackUrl, googleSessionHash } from "@/lib/google-auth";

export async function loginAdminGoogleAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const next = safeRedirectPath(formData.get("next"), "/dashboard");
  const callbackUrl = googleCallbackUrl(process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL);
  const sdk = createAdminSdk();
  const store = await cookies();
  const link = formData.get("link") === "true";
  const existingToken = link ? store.get(ADMIN_SESSION_COOKIE)?.value : undefined;
  if (link && !existingToken) redirect(`/login?next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`);
  if (!sdk || !callbackUrl) return { status: "error", message: "El acceso con Google no está disponible en este momento." };
  let location: string;
  try {
    const result = await sdk.auth.login("user", "google-admin", { callback_url: callbackUrl });
    const authorization = typeof result === "object" && "location" in result ? googleAuthorizationUrl(result.location, callbackUrl) : null;
    if (!authorization) throw new Error("invalid_authorization_url");
    store.set(GOOGLE_ATTEMPT_COOKIE, packSecret({ state: authorization.state, next, link, createdAt: Date.now(), ...(existingToken ? { sessionHash: googleSessionHash(existingToken) } : {}) }), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600,
    });
    location = authorization.location;
  } catch {
    return { status: "error", message: "No pudimos iniciar el acceso con Google. Inténtalo nuevamente." };
  }
  redirect(location);
}

