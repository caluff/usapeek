import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { readOrderFinance } from "../lib/order-finance/read";

/** Read-only diagnostic; never prints provider data, tokens, or customer details. */
export default async function inspectOrderFinance({
  container,
  args,
}: ExecArgs) {
  const orderId = args[0];
  if (!orderId || !/^order_[a-zA-Z0-9]+$/.test(orderId))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Supply one order ID.",
    );
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id"],
    pagination: { take: 1 },
  });
  if (!users[0]) throw new Error("No operator is configured.");
  const { view } = await readOrderFinance(container, orderId, {
    actor_id: users[0].id,
  });
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(JSON.stringify(view));
}
