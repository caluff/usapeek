import type { StripeConnectOptions } from "@mercurjs/payout-stripe-connect" with {
  "resolution-mode": "import",
};
import { MedusaError } from "@medusajs/framework/utils";

export type StripeConnectConfiguration = StripeConnectOptions & {
  paymentWebhookSecret: string;
  return_url: string;
  refresh_url: string;
  jobsEnabled: boolean;
};

export function getStripeConnectConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): StripeConnectConfiguration | null {
  const apiKey = environment.STRIPE_API_KEY?.trim();
  if (!apiKey) return null;
  if (!/^sk_test_[A-Za-z0-9]+$/.test(apiKey)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] This integration currently accepts test-mode keys only.",
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
    apiKey,
    webhookSecret,
    paymentWebhookSecret,
    return_url: new URL("/seller/settings/payments?returned=1", origin).href,
    refresh_url: new URL("/seller/settings/payments?refresh=1", origin).href,
    jobsEnabled: environment.STRIPE_AUTOMATIC_JOBS_ENABLED === "true",
  };
}
