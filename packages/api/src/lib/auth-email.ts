import { MedusaError } from "@medusajs/framework/utils";
import { getEmailSender } from "./email-sender";

export type AuthActor = "customer" | "user" | "member";
export type AuthEmailKind = "password-reset" | "email-verification";

type AuthEmailEnvironment = Partial<
  Record<
    | "AUTH_EMAIL_ENABLED"
    | "AUTH_EMAIL_FROM"
    | "RESEND_FROM_EMAIL"
    | "STOREFRONT_URL"
    | "ADMIN_URL"
    | "VENDOR_URL",
    string | undefined
  >
>;

const APP_URL_VARIABLE: Record<AuthActor, keyof AuthEmailEnvironment> = {
  customer: "STOREFRONT_URL",
  user: "ADMIN_URL",
  member: "VENDOR_URL",
};

const AUTH_PATH: Record<AuthActor, Record<AuthEmailKind, string>> = {
  customer: {
    "password-reset": "/reset-password",
    "email-verification": "/verify-email",
  },
  user: {
    "password-reset": "/reset-password",
    "email-verification": "/verify-email",
  },
  member: {
    "password-reset": "/seller/reset-password",
    "email-verification": "/seller/verify-email",
  },
};

export function isAuthActor(value: unknown): value is AuthActor {
  return value === "customer" || value === "user" || value === "member";
}

export function getAuthEmailConfiguration(
  environment: AuthEmailEnvironment = process.env,
) {
  if (environment.AUTH_EMAIL_ENABLED !== "true") {
    return { enabled: false as const };
  }

  const from = getEmailSender(environment);
  if (!from) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[auth-email] RESEND_FROM_EMAIL (or AUTH_EMAIL_FROM) is required when AUTH_EMAIL_ENABLED=true",
    );
  }

  return { enabled: true as const, from };
}

export function buildAuthEmailUrl(
  kind: AuthEmailKind,
  actor: AuthActor,
  secret: string,
  email: string,
  environment: AuthEmailEnvironment = process.env,
): string | null {
  const variable = APP_URL_VARIABLE[actor];
  const baseUrl = environment[variable]?.trim();
  if (!baseUrl || !secret || !email) return null;

  try {
    const parsedBase = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(parsedBase.protocol) ||
      parsedBase.username ||
      parsedBase.password ||
      parsedBase.search ||
      parsedBase.hash
    ) {
      return null;
    }

    const url = new URL(AUTH_PATH[actor][kind], parsedBase.origin);
    url.searchParams.set(kind === "password-reset" ? "token" : "code", secret);
    url.searchParams.set("email", email);
    return url.toString();
  } catch {
    return null;
  }
}

export function requiredAppUrlVariable(actor: AuthActor) {
  return APP_URL_VARIABLE[actor];
}
