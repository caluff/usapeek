import type {
  IStoreModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  paymentCaptureModeSchema,
  type PaymentCaptureSettingsResponse,
} from "./contracts";

export const CAPTURE_SETTINGS_METADATA_KEY = "usapeek_payment_capture";
export const CAPTURE_SETTINGS_LOCK_KEY = "usapeek-payment-capture-settings";
const savedCaptureSettingsSchema = z.strictObject({
  mode: paymentCaptureModeSchema,
  revision: z.uuid(),
  actor_id: z.string().startsWith("user_"),
});

export function parsePaymentCaptureSettings(
  metadata: Record<string, unknown> | null,
) {
  const saved = metadata?.[CAPTURE_SETTINGS_METADATA_KEY];
  if (saved === undefined) {
    return { mode: "manual" as const, revision: "initial", actor_id: null };
  }
  return savedCaptureSettingsSchema.parse(saved);
}

export async function readPaymentCaptureSettings(container: MedusaContainer) {
  const storeModule = container.resolve<IStoreModuleService>(Modules.STORE);
  const stores = await storeModule.listStores(
    {},
    {
      take: 2,
      select: ["id", "metadata"],
    },
  );
  if (stores.length !== 1) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No se pudo identificar la configuración de cobro del marketplace.",
    );
  }
  const store = stores[0];
  return { store, ...parsePaymentCaptureSettings(store.metadata) };
}

export function publicPaymentCaptureSettings(
  settings: Pick<
    Awaited<ReturnType<typeof readPaymentCaptureSettings>>,
    "mode" | "revision"
  >,
): PaymentCaptureSettingsResponse {
  return { settings: { mode: settings.mode, revision: settings.revision } };
}

export async function assertAutomaticCaptureSettings(
  container: MedusaContainer,
  revision: string,
  actorId: string,
) {
  const settings = await readPaymentCaptureSettings(container);
  if (
    settings.mode !== "automatic" ||
    settings.revision !== revision ||
    settings.actor_id !== actorId
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El modo de cobro cambió; se omitió el cobro automático.",
    );
  }
}
