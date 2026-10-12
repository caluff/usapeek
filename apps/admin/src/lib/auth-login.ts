import type { AuthLoginResponse } from "@medusajs/js-sdk";
import type { GooglePanelProfileResponse } from "@usapeek/api/auth-contracts";
import { redirect } from "next/navigation";
import { profileLoginDestination } from "@/features/account/profile-completion";
import { adminLoginErrorMessage } from "@/lib/auth-service";
import { createAdminSdk, setAdminSession, setAdminVerification, setAdminMfa } from "@/lib/auth-sdk";
import { type AuthActionState, safeExternalAuthUrl } from "@/lib/auth-utils";
const configurationError = (): AuthActionState => ({ status: "error", message: "El servicio de acceso no está disponible. Intenta más tarde." });

export async function completeAdminLogin(
  result: AuthLoginResponse,
  email: string,
  next: string,
): Promise<AuthActionState> {
  if (typeof result === "string") {
    const authenticated = createAdminSdk(result);
    if (!authenticated) return configurationError();
    let user;
    try {
      ({ user } = await authenticated.admin.user.me());
    } catch (error) {
      return { status: "error", message: adminLoginErrorMessage(error) };
    }
    if (!user.first_name?.trim() || !user.last_name?.trim()) {
      try {
        const { updated } = await authenticated.client.fetch<GooglePanelProfileResponse>(
          "/auth/account/profile/google",
          { method: "POST", body: {} },
        );
        if (updated) ({ user } = await authenticated.admin.user.me());
      } catch {
        // A missing provider profile can be completed after authentication.
      }
    }
    await setAdminSession(result);
    redirect(profileLoginDestination(user.first_name, next));
  }

  if ("verification_required" in result) {
    email = email || result.verification?.entity_id || "";
    await setAdminVerification({ token: result.token, email });
    try {
      await createAdminSdk(result.token)?.auth.verification.request({
        entity_id: email,
        entity_type: "email",
        metadata: { actor_type: "user" },
      });
    } catch {
      // The current code can still be valid; retry remains available.
    }
    redirect(`/verify-email?next=${encodeURIComponent(next)}`);
  }

  if ("mfa_required" in result) {
    await setAdminMfa({
      token: result.token,
      challengeId: result.mfa_challenge.id,
      methods: result.mfa_challenge.methods,
    });
    return {
      status: "mfa_required",
      message: "Confirma el segundo factor para continuar.",
      mfaMethods: result.mfa_challenge.methods,
    };
  }

  const externalUrl = safeExternalAuthUrl(result.location);
  return externalUrl
    ? {
        status: "external_redirect",
        message: "El proveedor requiere completar el acceso en otra página.",
        externalUrl,
      }
    : { status: "error", message: "El proveedor devolvió una redirección no válida." };
}

