import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type Stripe from "stripe";
import { createStripeClient } from "../stripe-client";
import { validateSellerPayoutAccount } from "@mercurjs/core/api/vendor/payout-accounts/helpers";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import { isStripeLivemode } from "../stripe-mode";
import { assertNativeStripePlatform, getNativeStripeAccountInput, getNativeStripeOnboardingInput } from "./provider-client";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const accountEvent = z.object({
  id: z.string().min(1),
  type: z.literal("account.updated"),
  livemode: z.boolean(),
  account: z.string().startsWith("acct_"),
  data: z.object({ object: z.object({
    id: z.string().startsWith("acct_"),
    metadata: z.object({ account_id: z.string().min(1) }),
  }) }),
});

export async function guardNativeStripeConnect(req: MedusaRequest, sellerId: string) {
  const route = req.originalUrl.split("?")[0].replace(/\/$/, "");
  if (!/^\/vendor\/payout-accounts(?:\/|$)/.test(route) || req.method === "OPTIONS") return;
  const configuration = getStripeConnectConfiguration();
  if (!configuration) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Stripe Connect onboarding is not configured.");
  }
  if (!sellerId) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Seller access is required.");
  if (req.method !== "POST") return;

  if (route === "/vendor/payout-accounts") {
    req.body = getNativeStripeAccountInput(req.body);
  } else {
    const match = route.match(/^\/vendor\/payout-accounts\/([^/]+)\/onboarding$/);
    if (!match) return;
    const input = getNativeStripeOnboardingInput(req.body, {
      returnUrl: configuration.return_url, refreshUrl: configuration.refresh_url,
    });
    await validateSellerPayoutAccount(req.scope, sellerId, decodeURIComponent(match[1]));
    req.body = input;
  }
  await assertNativeStripePlatform(configuration);
  req.validatedBody = req.body;
}

/** Register before the native /hooks/payout route to reject before Redis enqueue. */
export async function nativeStripePayoutWebhookGuard(
  req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction,
) {
  try {
    const configuration = getStripeConnectConfiguration();
    if (!configuration) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Stripe Connect webhook is not configured.");
    }
    const rawData = req.rawBody;
    const signature = req.headers["stripe-signature"];
    if (
      !(typeof rawData === "string" || Buffer.isBuffer(rawData)) ||
      !rawData.length || Buffer.byteLength(rawData) > MAX_WEBHOOK_BYTES ||
      typeof signature !== "string" || !signature
    ) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid Stripe webhook payload.");

    // Verify locally before enqueue. The native provider hydrates the account
    // in its subscriber; reconciliation rechecks it under the account lock.
    // Calling that provider here adds a third remote read before the ACK.
    const stripe = createStripeClient(configuration.apiKey);
    let verifiedEvent: Stripe.Event;
    try {
      verifiedEvent = stripe.webhooks.constructEvent(rawData, signature, configuration.webhookSecret);
    } catch {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe webhook verification failed.");
    }
    if (!isStripeLivemode(verifiedEvent.livemode, configuration.mode)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe webhook mode does not match this environment.");
    }
    if (verifiedEvent.type !== "account.updated") { res.sendStatus(200); return; }

    const parsed = accountEvent.safeParse(verifiedEvent);
    if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid Stripe account event.");
    const event = parsed.data;
    const account = event.data.object;
    if (event.account !== account.id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe webhook account identity mismatch.");
    }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: accounts } = await query.graph({
      entity: "payout_account", fields: ["id", "data"], filters: { id: account.metadata.account_id },
    }, { cache: { enable: false } });
    if (accounts.length !== 1 || accounts[0].data?.id !== account.id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stripe webhook account identity mismatch.");
    }
    // Queue only the verified body; retain raw bytes for the native subscriber verifier.
    req.body = verifiedEvent;
    next();
  } catch (error) {
    next(error);
  }
}
