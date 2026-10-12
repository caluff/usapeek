import { randomUUID } from "node:crypto";
import type {
  ILockingModule,
  MedusaContainer,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { reconcileAutomaticCapturesWorkflow } from "../workflows/reconcile-automatic-captures";

export default async function reconcileAutomaticCaptures(
  container: MedusaContainer,
) {
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const key = "automatic-payment-capture-scan";
  const ownerId = randomUUID();
  try {
    await locking.acquire(key, { ownerId, expire: 120 });
  } catch {
    return;
  }
  const heartbeat = setInterval(() => {
    void locking.acquire(key, { ownerId, expire: 120 }).catch(() => undefined);
  }, 30_000);
  try {
    await reconcileAutomaticCapturesWorkflow(container).run({ input: {} });
  } catch {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        "[automatic-capture] No se pudo completar la revisión de compras pendientes.",
      );
  } finally {
    clearInterval(heartbeat);
    await locking.release(key, { ownerId }).catch(() => undefined);
  }
}

export const config = {
  name: "reconcile-automatic-captures",
  schedule: "* * * * *",
};
