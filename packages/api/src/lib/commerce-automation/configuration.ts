import { getStripeConnectConfiguration } from "../stripe-connect-configuration";

/** No container resolution, query, workflow or lock may precede this guard. */
export function commerceAutomationEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (environment.STRIPE_AUTOMATIC_JOBS_ENABLED !== "true") return false;
  return getStripeConnectConfiguration(environment)?.jobsEnabled === true;
}

// These are code integration gates, deliberately not environment switches.
// Change only alongside verified native fixes and concurrency/accounting tests.
export const NATIVE_COMMERCE_BOUNDARIES = {
  cancellationSerializesAllWriters: false,
  capturePassesExplicitAmount: false,
  reducedCaptureFinalizesPaymentAndCollection: false,
  successfulWebhookReconcilesWithoutRecapture: false,
  retainedOrderAllocationIsAtomicAndUnique: false,
  nativePayoutEligibilityAndRecoveryVerified: false,
};

export function pendingCommerceBoundaries(): string[] {
  return Object.entries(NATIVE_COMMERCE_BOUNDARIES)
    .filter(([, ready]) => !ready)
    .map(([name]) => name);
}
