import type {
  IStoreModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import {
  DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
  paymentReleaseDelayDaysSchema,
  paymentReleaseModeSchema,
  type PaymentReleaseSettingsResponse,
} from "./contracts";

export const RELEASE_SETTINGS_METADATA_KEY = "usapeek_payment_release";
const savedReleaseSettingsSchema = z.strictObject({
  mode: paymentReleaseModeSchema,
  delay_days: paymentReleaseDelayDaysSchema.default(
    DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
  ),
  revision: z.uuid(),
  actor_id: z.string().startsWith("user_"),
});

export function automaticReleaseAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const configuration = getStripeConnectConfiguration(env);
    return Boolean(configuration && !configuration.jobsEnabled);
  } catch {
    return false;
  }
}

export function parsePaymentReleaseSettings(
  metadata: Record<string, unknown> | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  const saved = metadata?.[RELEASE_SETTINGS_METADATA_KEY];
  if (saved === undefined) {
    const mode =
      env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED === "true"
        ? "automatic"
        : "manual";
    return {
      mode: paymentReleaseModeSchema.parse(mode),
      delay_days: DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
      revision: `initial:${mode}`,
      actor_id: null,
    };
  }
  return savedReleaseSettingsSchema.parse(saved);
}

export async function readPaymentReleaseSettings(
  container: MedusaContainer,
  env: NodeJS.ProcessEnv = process.env,
) {
  const storeModule = container.resolve<IStoreModuleService>(Modules.STORE);
  const stores = await storeModule.listStores(
    {},
    { take: 2, select: ["id", "metadata"] },
  );
  if (stores.length !== 1) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No se pudo identificar la configuración de liberación del marketplace.",
    );
  }
  const store = stores[0];
  return {
    store,
    ...parsePaymentReleaseSettings(store.metadata, env),
    automatic_available: automaticReleaseAvailable(env),
  };
}

export function publicPaymentReleaseSettings(
  settings: Pick<
    Awaited<ReturnType<typeof readPaymentReleaseSettings>>,
    "mode" | "delay_days" | "revision" | "automatic_available"
  >,
): PaymentReleaseSettingsResponse {
  return {
    settings: {
      mode: settings.mode,
      delay_days: settings.delay_days,
      revision: settings.revision,
    },
    automatic_available: settings.automatic_available,
  };
}
