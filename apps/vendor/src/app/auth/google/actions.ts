"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createVendorSdk } from "@/lib/auth-sdk";
import { VENDOR_SESSION_COOKIE, packSecret, safeRedirectPath, type VendorAuthActionState } from "@/lib/auth-utils";
import { GOOGLE_ATTEMPT_COOKIE, googleAuthorizationUrl, googleCallbackUrl, googleSessionHash } from "@/lib/google-auth";

export async function loginVendorGoogleAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const next = safeRedirectPath(formData.get("next"), "/seller");
  const callbackUrl = googleCallbackUrl(process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL);
  const sdk = createVendorSdk();
  const store = await cookies();
  const link = formData.get("link") === "true";
  const existingToken = link ? store.get(VENDOR_SESSION_COOKIE)?.value : undefined;
  if (link && !existingToken) redirect(`/seller/login?next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`);
  if (!sdk || !callbackUrl) return { status: "error", message: "El acceso con Google no está disponible en este momento." };
  let location: string;
  try {
    const result = await sdk.auth.login("member", "google", { callback_url: callbackUrl });
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

