import type {
  ILockingModule,
  Logger,
  MedusaContainer,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { randomUUID } from "node:crypto";
import { reconcileVendorSettlementsWorkflow } from "../workflows/reconcile-vendor-settlements";

export default async function reconcileVendorSettlements(
  container: MedusaContainer,
) {
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const ownerId = randomUUID();
  const key = "vendor-settlement-projections";
  try {
    await locking.acquire(key, { ownerId, expire: 120 });
  } catch {
    return;
  }
  const heartbeat = setInterval(() => {
    void locking.acquire(key, { ownerId, expire: 120 }).catch(() => undefined);
  }, 30_000);
  try {
    await reconcileVendorSettlementsWorkflow(container).run({
      input: { take: 1, lock_owner_id: ownerId },
    });
  } catch {
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(
        "[vendor-settlements] Registry refresh deferred; unverified balances remain unknown.",
      );
  } finally {
    clearInterval(heartbeat);
    await locking.release(key, { ownerId }).catch(() => undefined);
  }
}

export const config = {
  name: "reconcile-vendor-settlements",
  schedule: "* * * * *",
};
