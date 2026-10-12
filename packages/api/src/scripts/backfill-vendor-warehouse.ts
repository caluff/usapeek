import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { backfillVendorWarehouseWorkflow } from "../workflows/backfill-vendor-warehouse";

export default async function backfillVendorWarehouse({ container, args }: ExecArgs) {
  const [sellerId, mode = "dry-run"] = args;
  if (!sellerId || !["dry-run", "apply"].includes(mode)) throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, "Usage: medusa exec ./src/scripts/backfill-vendor-warehouse.ts <seller-id> [dry-run|apply]");
  const { result } = await backfillVendorWarehouseWorkflow(container).run({ input: { seller_id: sellerId, dry_run: mode === "dry-run" } });
  container.resolve(ContainerRegistrationKeys.LOGGER).info(JSON.stringify(result));
}
