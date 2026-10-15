import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type {
  CreateOnboardingInput,
  CreatePayoutAccountInput,
} from "@mercurjs/types";
import { createStripeClient } from "../stripe-client";
import type { StripeConnectConfiguration } from "../stripe-connect-configuration";
import { assertStripePlatformAccount } from "../stripe-mode";

/** Verify the configured platform before native Connect operations can write. */
export async function assertNativeStripePlatform(
  configuration: StripeConnectConfiguration,
) {
  // Preserve the existing unbound TEST configuration used by develop.
  if (configuration.mode !== "live" && !process.env.STRIPE_ACCOUNT_ID?.trim()) return;
  const stripe = createStripeClient(configuration.apiKey, {
    timeout: 10000,
    maxNetworkRetries: 0,
  });
  const platform = await stripe.accounts.retrieveCurrent();
  assertStripePlatformAccount(platform.id);
}

const emptyContext = z.strictObject({}).optional();
const accountBody = z.strictObject({
  data: z.strictObject({ country: z.literal("US") }),
  context: emptyContext,
});
const onboardingBody = z.strictObject({
  data: z.strictObject({
    return_url: z.string().optional(),
    refresh_url: z.string().optional(),
  }).optional(),
  context: emptyContext,
});

export function getNativeStripeAccountInput(body: unknown): CreatePayoutAccountInput {
  if (!accountBody.safeParse(body).success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Stripe account creation accepts only US country data and no caller context.",
    );
  }

  // Mercur supplies the local account metadata and its own idempotency key.
  return { data: { country: "US" } };
}

function validateConfiguredRedirect(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid Stripe onboarding redirect configuration.");
  }

  const isLocalHttp = url.protocol === "http:" && (
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".orca.localhost")
  );
  if ((url.protocol !== "https:" && !isLocalHttp) || url.username || url.password || url.hash) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid Stripe onboarding redirect configuration.");
  }
  return url.href;
}

/** Run with server-owned redirects before forwarding to the native workflow. */
export function getNativeStripeOnboardingInput(
  body: unknown,
  redirects: { returnUrl: string; refreshUrl: string },
): CreateOnboardingInput {
  const parsed = onboardingBody.safeParse(body);
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe onboarding accepts only return and refresh URLs.");
  }

  const returnUrl = validateConfiguredRedirect(redirects.returnUrl);
  const refreshUrl = validateConfiguredRedirect(redirects.refreshUrl);
  if (new URL(returnUrl).origin !== new URL(refreshUrl).origin) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe onboarding redirects must share an origin.");
  }
  if (
    (parsed.data.data?.return_url !== undefined && parsed.data.data.return_url !== returnUrl) ||
    (parsed.data.data?.refresh_url !== undefined && parsed.data.data.refresh_url !== refreshUrl)
  ) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe onboarding redirects must match the configured URLs.");
  }

  // Never forward data.id: Mercur merges caller data over its stored Stripe account.
  return { data: { return_url: returnUrl, refresh_url: refreshUrl } };
}
