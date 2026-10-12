import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  reconcileStripeAccount,
  resolveVendorStripeAccount,
  type StripeAccountVendor,
} from "../../lib/stripe-connect/account-reconciliation";

export const resolveVendorStripeAccountStep = createStep(
  "resolve-vendor-stripe-account",
  async (input: StripeAccountVendor, { container }) =>
    new StepResponse(await resolveVendorStripeAccount(container, input)),
);

// A fresh provider observation must never be compensated back to a stale status.
export const reconcileStripeAccountStep = createStep(
  "reconcile-stripe-account",
  async (input: Parameters<typeof reconcileStripeAccount>[1], { container }) =>
    new StepResponse(await reconcileStripeAccount(container, input)),
);
