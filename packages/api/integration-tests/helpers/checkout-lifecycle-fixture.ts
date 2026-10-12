import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { MedusaContainer, IPaymentProvider } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createRemoteLinkStep } from "@medusajs/core-flows";
import type payoutModule from "@mercurjs/core/modules/payout";
import { MercurModules, PayoutAccountStatus } from "@mercurjs/types";

const externalKeys = [
  "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PAYOUT_WEBHOOK_SECRET",
  "ALGOLIA_APP_ID", "ALGOLIA_API_KEY", "ALGOLIA_PRODUCT_INDEX",
  "SUPABASE_S3_ENDPOINT", "SUPABASE_S3_REGION", "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY", "SUPABASE_STORAGE_BUCKET",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL",
  "RESEND_API_KEY", "RESEND_FROM_EMAIL", "AUTH_EMAIL_FROM",
];

function rejectUnsafeFixture(message: string): never {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
}

/** Called only after explicit suite opt-in, before the Medusa bootstrap. */
export function isolatedCheckoutLifecycleEnvironment() {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" || process.env.DB_USERNAME !== "closure_test" || !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" || !process.env.NODE_EXTRA_CA_CERTS ||
    !existsSync(process.env.NODE_EXTRA_CA_CERTS) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    rejectUnsafeFixture("Checkout lifecycle tests require the reserved local TLS PostgreSQL importer.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || redis.port !== "56379" ||
    redis.username !== "closure" || !redis.password || redis.pathname !== "/15" || redis.search || redis.hash) {
    rejectUnsafeFixture("Reserve the dedicated localhost TLS Redis DB15 before this runner.");
  }
  if ((process.env.JWT_SECRET?.trim().length ?? 0) < 32 ||
    (process.env.COOKIE_SECRET?.trim().length ?? 0) < 32 || process.env.JWT_SECRET === process.env.COOKIE_SECRET) {
    rejectUnsafeFixture("Distinct ephemeral authentication secrets are required.");
  }
  for (const key of externalKeys) {
    if (process.env[key]?.trim()) rejectUnsafeFixture("External credentials must be disabled before this test runner.");
    process.env[key] = " ";
  }
  const dbName = `closure_checkout_lifecycle_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  return dbName;
}

export function assertLifecycleBootstrap(container: MedusaContainer, dbName: string) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const target = new URL(config.projectConfig.databaseUrl!);
  if (target.hostname !== "localhost" || target.port !== "55432" || target.pathname !== `/${dbName}` ||
    config.projectConfig.redisUrl !== process.env.REDIS_URL) {
    rejectUnsafeFixture("The application must use this runner's disposable database.");
  }
  for (const module of Object.values(config.modules ?? {})) {
    if (!module || typeof module !== "object") continue;
    const providers = "options" in module ? module.options?.providers : undefined;
    for (const adapter of [module, ...(Array.isArray(providers) ? providers : [])]) {
      if (typeof adapter.resolve === "string" && /stripe|resend|algolia|file-s3|google/i.test(adapter.resolve)) {
        rejectUnsafeFixture("This suite may only load local providers, never external adapters.");
      }
    }
  }
}

/**
 * Explicit simulation: readiness config is enabled only AFTER bootstrap, when
 * the only payment adapter is native pp_system_default. These are not secrets,
 * Stripe accounts, Stripe payments or proof of external provider behavior.
 */
export function simulateCheckoutConfiguration(enabled: boolean) {
  process.env.STRIPE_API_KEY = enabled ? "sk_test_local" : " ";
  process.env.STRIPE_WEBHOOK_SECRET = enabled ? "whsec_LocalLifecycleSimulation" : " ";
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = enabled ? "whsec_LocalLifecycleSimulation" : " ";
}

type PayoutService = InstanceType<typeof payoutModule.service>;
const checkoutLifecycleLocalAccountStep = createStep("checkout-lifecycle-local-account", async (_input: object, { container }) => {
  const id = `pacc_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const account = await container.resolve<PayoutService>(MercurModules.PAYOUT).createPayoutAccounts({
    id,
    status: PayoutAccountStatus.ACTIVE,
    data: { id: `acct_simulated_${randomUUID().replaceAll("-", "")}`, country: "US", metadata: { account_id: id, simulation: "checkout-lifecycle" } },
  });
  return new StepResponse(account.id, account.id);
}, async (id, { container }) => {
  if (id) await container.resolve<PayoutService>(MercurModules.PAYOUT).deletePayoutAccounts(id);
});

// Only account readiness is a fixture. Native checkout validation, ownership,
// inventory, originals, orders, payment persistence and rollback stay real.
export const linkSimulatedCheckoutAccount = createWorkflow("link-simulated-checkout-account", function (input: { seller_id: string }) {
  const id = checkoutLifecycleLocalAccountStep();
  createRemoteLinkStep(transform({ input, id }, value => [{
    [MercurModules.SELLER]: { seller_id: value.input.seller_id },
    [MercurModules.PAYOUT]: { payout_account_id: value.id },
  }]));
  return new WorkflowResponse(id);
});

export function localPaymentProvider(container: MedusaContainer): IPaymentProvider {
  // Installed 2.18 PaymentModuleService exposes this internal collaborator.
  // Touch only the local adapter; do not replace the module/workflow itself.
  const payment = container.resolve(Modules.PAYMENT) as unknown as {
    paymentProviderService_: { retrieveProvider(id: string): IPaymentProvider };
  };
  const provider = payment.paymentProviderService_.retrieveProvider("pp_system_default");
  if (provider.constructor.name !== "SystemPaymentProvider") rejectUnsafeFixture("Expected native local payment provider.");
  return provider;
}
