export const ADMIN_SESSION_COOKIE = "mv2_admin_user_session";
export const ADMIN_MFA_COOKIE = "mv2_admin_user_mfa";
export const ADMIN_RESET_COOKIE = "mv2_admin_user_reset";
export const ADMIN_VERIFICATION_COOKIE = "mv2_admin_user_verification";
export const ADMIN_VERIFICATION_CODE_COOKIE = "mv2_admin_user_verification_code";

export type AuthActionState = {
  status:
    | "idle"
    | "error"
    | "success"
    | "verification_required"
    | "mfa_required"
    | "external_redirect";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "code", string>>;
  externalUrl?: string;
  mfaMethods?: string[];
};

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" };

export function normalizeEmail(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateCredentials(email: string, password: string) {
  const errors: NonNullable<AuthActionState["fieldErrors"]> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.email = "Ingresa un correo electrónico válido.";
  }
  if (password.length < 8 || password.length > 256) {
    errors.password = "La contraseña debe tener entre 8 y 256 caracteres.";
  }
  return errors;
}

export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback: string,
) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return fallback;
  }
  try {
    const base = new URL("https://admin.invalid");
    const candidate = new URL(value, base);
    const authenticationRoutes = [
      "/auth/google/callback",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
    ];
    return candidate.origin === base.origin &&
      !authenticationRoutes.some(
        (route) =>
          candidate.pathname === route || candidate.pathname.startsWith(`${route}/`),
      )
      ? `${candidate.pathname}${candidate.search}${candidate.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function safeExternalAuthUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function packSecret(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function unpackSecret<T>(value: string | undefined): T | null {
  try {
    return value
      ? (JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T)
      : null;
  } catch {
    return null;
  }
}

export function jwtMaxAge(token: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: unknown };
    if (typeof payload.exp !== "number") return 86_400;
    return Math.max(
      60,
      Math.min(payload.exp - Math.floor(Date.now() / 1000), 604_800),
    );
  } catch {
    return 86_400;
  }
}

export function isJwtExpired(token: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000;
  } catch {
    return true;
  }
}
