import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { automaticSettlementEnabled } from "../lib/order-finance/automatic-settlement";
import { automaticallySettleOrdersWorkflow } from "../workflows/automatically-settle-orders";

export default async function automaticallySettleOrders(
  container: MedusaContainer,
) {
  try {
    if (!(await automaticSettlementEnabled(container))) return;
    await automaticallySettleOrdersWorkflow(container).run({ input: {} });
  } catch {
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(
        "[automatic-settlement] Evaluation stopped; completed transfers are never automatically repeated.",
      );
  }
}

export const config = {
  name: "automatically-settle-orders",
  schedule: "* * * * *",
};
