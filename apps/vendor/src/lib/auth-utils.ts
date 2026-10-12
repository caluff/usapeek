export const VENDOR_SESSION_COOKIE = "mv2_vendor_member_session";
export const VENDOR_SELLER_COOKIE = "mv2_vendor_seller_context";
export const VENDOR_MFA_COOKIE = "mv2_vendor_member_mfa";
export const VENDOR_RESET_COOKIE = "mv2_vendor_member_reset";
export const VENDOR_VERIFICATION_COOKIE = "mv2_vendor_member_verification";
export const VENDOR_VERIFICATION_CODE_COOKIE = "mv2_vendor_member_verification_code";

export type VendorAuthActionState = {
  status:
    | "idle"
    | "error"
    | "success"
    | "mfa_required"
    | "verification_required"
    | "external_redirect";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "code" | "seller", string>>;
  mfaMethods?: string[];
  externalUrl?: string;
};

export const INITIAL_VENDOR_AUTH_STATE: VendorAuthActionState = { status: "idle" };

export function normalizeEmail(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateCredentials(email: string, password: string) {
  const errors: NonNullable<VendorAuthActionState["fieldErrors"]> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.email = "Ingresa un correo electrónico válido.";
  }
  if (password.length < 8 || password.length > 256) {
    errors.password = "La contraseña debe tener entre 8 y 256 caracteres.";
  }
  return errors;
}

export function safeRedirectPath(value: FormDataEntryValue | string | null | undefined, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const base = new URL("https://vendor.invalid");
    const candidate = new URL(value, base);
    const authenticationRoutes = [
      "/auth/google/callback",
      "/seller/login",
      "/seller/forgot-password",
      "/seller/reset-password",
      "/seller/verify-email",
      "/seller/no-access",
      "/seller/select-seller",
      "/seller/status",
    ];
    return candidate.origin === base.origin &&
      !authenticationRoutes.some((route) => candidate.pathname === route || candidate.pathname.startsWith(`${route}/`))
      ? `${candidate.pathname}${candidate.search}${candidate.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function safeExternalAuthUrl(value: string) {
  try {
    const url = new URL(value);
    return (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function packSecret(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function unpackSecret<T>(value: string | undefined): T | null {
  try {
    return value ? JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T : null;
  } catch {
    return null;
  }
}

export function jwtMaxAge(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? Math.max(60, Math.min(payload.exp - Math.floor(Date.now() / 1000), 604_800)) : 86_400;
  } catch {
    return 86_400;
  }
}

export function isJwtExpired(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000;
  } catch {
    return true;
  }
}

export function sellerChoice(count: number): "none" | "single" | "multiple" {
  if (count <= 0) return "none";
  return count === 1 ? "single" : "multiple";
}
