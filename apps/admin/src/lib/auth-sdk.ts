import Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { retrieveAdminUser } from "@/lib/auth-service";
import {
  ADMIN_MFA_COOKIE,
  ADMIN_RESET_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_VERIFICATION_CODE_COOKIE,
  ADMIN_VERIFICATION_COOKIE,
  jwtMaxAge,
  packSecret,
  unpackSecret,
} from "@/lib/auth-utils";

type MfaSecret = { token: string; challengeId: string; methods: string[] };
type VerificationSecret = { token: string; email: string };
type ResetSecret = { token: string; email?: string };

function backendUrl() {
  const value = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function createAdminSdk(token?: string) {
  const baseUrl = backendUrl();
  if (!baseUrl) return null;
  return new Medusa({
    baseUrl,
    debug: false,
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function getAdminToken() {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

const getAdminAccount = cache(async () => {
  const token = await getAdminToken();
  if (!token) return null;
  const sdk = createAdminSdk(token);
  if (!sdk) throw new Error("Admin backend is not configured");
  const user = await retrieveAdminUser(sdk.admin.user);
  return user ? { user, sdk } : null;
});

export async function requireAdminSdk() {
  const account = await getAdminAccount();
  if (!account) redirect("/login?reason=expired&next=%2Fdashboard");
  return account.sdk;
}

const secure = process.env.NODE_ENV === "production";

export async function setAdminSession(token: string) {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: jwtMaxAge(token),
  });
  store.delete(ADMIN_MFA_COOKIE);
  store.delete(ADMIN_RESET_COOKIE);
  store.delete(ADMIN_VERIFICATION_COOKIE);
  store.delete(ADMIN_VERIFICATION_CODE_COOKIE);
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  store.delete(ADMIN_MFA_COOKIE);
  store.delete(ADMIN_RESET_COOKIE);
  store.delete(ADMIN_VERIFICATION_COOKIE);
  store.delete(ADMIN_VERIFICATION_CODE_COOKIE);
}

export async function setAdminMfa(secret: MfaSecret) {
  (await cookies()).set(ADMIN_MFA_COOKIE, packSecret(secret), {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 600,
  });
}

export async function getAdminMfa() {
  return unpackSecret<MfaSecret>(
    (await cookies()).get(ADMIN_MFA_COOKIE)?.value,
  );
}

export async function setAdminVerification(secret: VerificationSecret) {
  (await cookies()).set(ADMIN_VERIFICATION_COOKIE, packSecret(secret), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 1800,
  });
}

export async function getAdminVerification() {
  return unpackSecret<VerificationSecret>(
    (await cookies()).get(ADMIN_VERIFICATION_COOKIE)?.value,
  );
}

export async function getAdminVerificationCode() {
  return (await cookies()).get(ADMIN_VERIFICATION_CODE_COOKIE)?.value;
}

export async function clearAdminVerification() {
  const store = await cookies();
  store.delete(ADMIN_VERIFICATION_COOKIE);
  store.delete(ADMIN_VERIFICATION_CODE_COOKIE);
}

export async function getAdminReset() {
  return unpackSecret<ResetSecret>(
    (await cookies()).get(ADMIN_RESET_COOKIE)?.value,
  );
}

export async function clearAdminReset() {
  (await cookies()).delete(ADMIN_RESET_COOKIE);
}

export async function getCurrentAdmin(): Promise<HttpTypes.AdminUser | null> {
  return (await getAdminAccount())?.user ?? null;
}
