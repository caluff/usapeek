import { randomUUID } from "node:crypto";
import type {
  ILockingModule,
  Logger,
  MedusaContainer,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { reconcileVendorFinanceReportingWorkflow } from "../workflows/reconcile-vendor-finance-reporting";

export default async function reconcileVendorFinanceReporting(
  container: MedusaContainer,
) {
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const ownerId = randomUUID();
  const key = "vendor-finance-reporting-projections";
  try {
    await locking.acquire(key, { ownerId, expire: 120 });
  } catch {
    return;
  }
  const heartbeat = setInterval(() => {
    void locking.acquire(key, { ownerId, expire: 120 }).catch(() => undefined);
  }, 30_000);
  try {
    await reconcileVendorFinanceReportingWorkflow(container).run({
      input: { lock_owner_id: ownerId },
    });
  } catch {
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(
        "[vendor-finance-reporting] Projection refresh deferred; incomplete totals remain unknown.",
      );
  } finally {
    clearInterval(heartbeat);
    await locking.release(key, { ownerId }).catch(() => undefined);
  }
}

export const config = {
  name: "reconcile-vendor-finance-reporting",
  schedule: "* * * * *",
};
