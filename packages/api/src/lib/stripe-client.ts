import Stripe from "stripe";

export const STRIPE_API_VERSION = "2024-04-10";

export function createStripeClient(
  apiKey: string,
  options: Omit<Stripe.StripeConfig, "apiVersion"> = {},
) {
  return new Stripe(apiKey, {
    ...options,
    maxNetworkRetries: options.maxNetworkRetries ?? 1,
    // Preserve the financial API contract used by SDK 15 and the native providers.
    // Stripe's SDK types describe only its latest API; the runtime supports this pin.
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
