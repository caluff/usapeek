import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { ILockingModule, Logger } from "@medusajs/framework/types";
import { randomUUID } from "node:crypto";
import { z } from "@medusajs/framework/zod";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { reconcileVendorFinanceReportingWorkflow } from "../workflows/reconcile-vendor-finance-reporting";

/** Populate only reporting read models. Never observes providers or moves funds. */
export default async function prepareAdminFinanceReporting({
  container,
  args,
}: ExecArgs) {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(args[0] ?? "25");
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const key = "vendor-finance-reporting-projections";
  const ownerId = randomUUID();
  await locking.acquire(key, { ownerId, expire: 120 });
  const heartbeat = setInterval(() => {
    void locking.acquire(key, { ownerId, expire: 120 }).catch(() => undefined);
  }, 30_000);
  try {
    for (let batch = 0; batch < limit; batch++) {
      const result = await reconcileVendorFinanceReportingWorkflow(
        container,
      ).run({ input: { lock_owner_id: ownerId } });
      const registry = await journal.readAdminFinanceReportingRegistry();
      const pending = registry.rows.filter((row) => !row.is_fresh).length;
      logger.info(
        JSON.stringify({
          batch: batch + 1,
          saved_groups: result.result.saved,
          discovered_groups: registry.rows.length,
          pending_groups: pending,
          discovery_complete: registry.discovery.complete,
        }),
      );
      if (!pending && registry.discovery.complete && !registry.truncated) break;
    }
  } finally {
    clearInterval(heartbeat);
    await locking.release(key, { ownerId });
  }
}
