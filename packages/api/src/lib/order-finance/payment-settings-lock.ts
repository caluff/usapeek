import { randomUUID } from "node:crypto";
import type {
  ILockingModule,
  MedusaContainer,
} from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { CAPTURE_SETTINGS_LOCK_KEY } from "./capture-settings";

export async function withPaymentSettingsLock<T>(
  container: MedusaContainer,
  work: () => Promise<T>,
): Promise<T> {
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const ownerId = randomUUID();
  try {
    // No lease can expire while a provider request is still in flight.
    await locking.acquire(CAPTURE_SETTINGS_LOCK_KEY, { ownerId });
  } catch {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Hay una operación de pagos en curso. Vuelve a intentarlo cuando termine; si el proceso se interrumpió, requiere revisión.",
    );
  }
  try {
    return await work();
  } finally {
    if (!(await locking.release(CAPTURE_SETTINGS_LOCK_KEY, { ownerId }))) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El bloqueo de configuración de pagos cambió; se requiere revisión.",
      );
    }
  }
}
