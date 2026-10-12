"use server";

import { redirect } from "next/navigation";
import { completeAdminLogin } from "@/lib/auth-login";

import { adminLoginErrorMessage } from "@/lib/auth-service";
import {
  clearAdminReset,
  clearAdminSession,
  clearAdminVerification,
  createAdminSdk,
  getAdminMfa,
  getAdminReset,
  getAdminVerification,
  getAdminVerificationCode,
} from "@/lib/auth-sdk";
import {
  type AuthActionState,
  normalizeEmail,
  safeRedirectPath,
  validateCredentials,
} from "@/lib/auth-utils";

function configurationError(): AuthActionState {
  return {
    status: "error",
    message:
      "El servicio de acceso no está disponible. Intenta más tarde o contacta al soporte.",
  };
}

export async function loginAdminAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next"), "/dashboard");
  const fieldErrors = validateCredentials(email, password);
  if (Object.keys(fieldErrors).length) {
    return { status: "error", message: "Revisa los campos indicados.", fieldErrors };
  }
  const sdk = createAdminSdk();
  if (!sdk) return configurationError();
  try {
    return completeAdminLogin(
      await sdk.auth.login("user", "emailpass", { email, password }),
      email,
      next,
    );
  } catch (error) {
    return { status: "error", message: adminLoginErrorMessage(error) };
  }
}

export async function verifyAdminMfaAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "").trim();
  const next = safeRedirectPath(formData.get("next"), "/dashboard");
  const secret = await getAdminMfa();
  if (!secret) return { status: "error", message: "El desafío venció. Inicia sesión nuevamente." };
  const method = String(formData.get("method") ?? secret.methods[0] ?? "totp");
  if (!code || code.length > 128 || !secret.methods.includes(method)) {
    return { status: "mfa_required", message: "Ingresa un código válido.", fieldErrors: { code: "El código es obligatorio." }, mfaMethods: secret.methods };
  }
  const sdk = createAdminSdk(secret.token);
  if (!sdk) return configurationError();
  let token;
  try {
    token = await sdk.auth.mfa.verifyChallenge(secret.challengeId, { method, code });
  } catch {
    return { status: "mfa_required", message: "No pudimos validar el código.", mfaMethods: secret.methods };
  }
  return completeAdminLogin(token, "", next);
}

export async function forgotAdminPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { status: "error", message: "Revisa el correo indicado.", fieldErrors: { email: "Ingresa un correo válido." } };
  }
  const sdk = createAdminSdk();
  if (!sdk) return configurationError();
  try {
    await sdk.auth.resetPassword("user", "emailpass", {
      identifier: email,
      metadata: { actor_type: "user" },
    });
  } catch {
    // Deliberately indistinguishable from a successful request.
  }
  return { status: "success", message: "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña." };
}

export async function resetAdminPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const secret = await getAdminReset();
  if (password.length < 8 || password.length > 256) return { status: "error", message: "Usa una contraseña de entre 8 y 256 caracteres.", fieldErrors: { password: "Contraseña no válida." } };
  if (password !== confirmation) return { status: "error", message: "Las contraseñas no coinciden." };
  if (!secret?.token) return { status: "error", message: "El enlace no es válido o ya venció." };
  const sdk = createAdminSdk();
  if (!sdk) return configurationError();
  try {
    await sdk.auth.updateProvider("user", "emailpass", { password }, secret.token);
    await clearAdminReset();
    return { status: "success", message: "Contraseña actualizada. Ya puedes iniciar sesión." };
  } catch {
    return { status: "error", message: "El enlace no es válido o ya venció." };
  }
}

export async function confirmAdminEmailAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "").trim() || (await getAdminVerificationCode()) || "";
  const secret = await getAdminVerification();
  const sdk = createAdminSdk(secret?.token);
  if (!code || code.length > 512) return { status: "error", message: "Ingresa un código válido.", fieldErrors: { code: "El código es obligatorio." } };
  if (!sdk) return configurationError();
  try {
    await sdk.auth.verification.confirm({ code });
    await clearAdminVerification();
    return { status: "success", message: "Correo verificado. Inicia sesión para continuar." };
  } catch {
    return { status: "error", message: "El código no es válido o ya venció." };
  }
}

export async function resendAdminVerificationAction(): Promise<AuthActionState> {
  const secret = await getAdminVerification();
  const sdk = createAdminSdk(secret?.token);
  if (!secret || !sdk) return { status: "error", message: "Inicia sesión nuevamente para pedir otro código." };
  try {
    await sdk.auth.verification.request({
      entity_id: secret.email,
      entity_type: "email",
      metadata: { actor_type: "user" },
    });
    return { status: "success", message: "Enviamos un nuevo código." };
  } catch {
    return { status: "error", message: "No pudimos enviar otro código ahora." };
  }
}

export async function logoutAdminAction() {
  const sdk = createAdminSdk();
  try {
    await sdk?.auth.logout();
  } finally {
    await clearAdminSession();
  }
  redirect("/login");
}
