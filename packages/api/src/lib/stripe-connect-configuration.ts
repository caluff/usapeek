import type { StripeConnectOptions } from "@mercurjs/payout-stripe-connect" with {
  "resolution-mode": "import",
};
import { MedusaError } from "@medusajs/framework/utils";
import {
  getStripeApiKeyMode,
  getStripeMode,
  type StripeMode,
} from "./stripe-mode";

export type StripeConnectConfiguration = StripeConnectOptions & {
  paymentWebhookSecret: string;
  return_url: string;
  refresh_url: string;
  jobsEnabled: boolean;
  mode: StripeMode;
  livemode: boolean;
};

export function getStripeConnectConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): StripeConnectConfiguration | null {
  const mode = getStripeMode(environment);
  const apiKey = environment.STRIPE_API_KEY?.trim();
  if (!apiKey) return null;
  if (getStripeApiKeyMode(apiKey) !== mode) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] The secret API key must match STRIPE_MODE.",
    );
  }
  if (mode === "live") {
    if (environment.STRIPE_LIVE_ENABLED !== "true")
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "[stripe] LIVE payments require explicit STRIPE_LIVE_ENABLED=true.",
      );
    if (
      !/^acct_[A-Za-z0-9]+$/.test(environment.STRIPE_ACCOUNT_ID?.trim() ?? "")
    )
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "[stripe] LIVE requires the principal platform STRIPE_ACCOUNT_ID.",
      );
    if (
      environment.STRIPE_AUTOMATIC_JOBS_ENABLED === "true" ||
      environment.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED === "true"
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "[stripe] Automatic financial jobs remain available in TEST only.",
      );
  }
  const webhookSecret = environment.STRIPE_PAYOUT_WEBHOOK_SECRET?.trim();
  const paymentWebhookSecret = environment.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret || !paymentWebhookSecret) return null;
  if (
    ![webhookSecret, paymentWebhookSecret].every((value) =>
      /^whsec_[A-Za-z0-9]+$/.test(value),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] Configure valid payment and payout webhook signing secrets.",
    );
  }
  const configuredOrigin =
    environment.VENDOR_PUBLIC_URL?.trim() ||
    (environment.NODE_ENV !== "production" ? "http://localhost:7001" : "");
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] VENDOR_PUBLIC_URL must be the public vendor application origin.",
    );
  }
  const isLocal =
    ["localhost", "127.0.0.1"].includes(origin.hostname) ||
    origin.hostname.endsWith(".orca.localhost");
  if (
    (origin.protocol !== "https:" &&
      !(
        environment.NODE_ENV !== "production" &&
        isLocal &&
        origin.protocol === "http:"
      )) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] VENDOR_PUBLIC_URL must be a secure origin without credentials, path or query.",
    );
  return {
    mode,
    livemode: mode === "live",
    apiKey,
    webhookSecret,
    paymentWebhookSecret,
    return_url: new URL("/seller/settings/payments?returned=1", origin).href,
    refresh_url: new URL("/seller/settings/payments?refresh=1", origin).href,
    jobsEnabled: environment.STRIPE_AUTOMATIC_JOBS_ENABLED === "true",
  };
}
