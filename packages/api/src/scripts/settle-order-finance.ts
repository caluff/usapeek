import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  settleOrderFinanceWorkflow,
  settleOrderInputSchema,
} from "../workflows/settle-order-finance";
import { prepareOrderSettlement } from "../lib/order-finance/settlement-plan";

/** Inspects by default. Mutation requires the literal final --execute argument. */
export default async function settleOrderFinance({
  container,
  args,
}: ExecArgs) {
  if (args.length !== 4 && !(args.length === 5 && args[4] === "--execute"))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Usage: order_id actor_id request_uuid reason [--execute]",
    );
  const input = settleOrderInputSchema.parse({
    order_id: args[0],
    actor_id: args[1],
    request_id: args[2],
    note: args[3],
  });
  let output: unknown;
  if (args[4] === "--execute") {
    const { result } = await settleOrderFinanceWorkflow(container).run({
      input,
    });
    output = {
      plan: result.plan,
      payout_id: result.payout_id,
      transfer_id: result.transfer_id,
      linked: result.linked,
    };
  } else output = (await prepareOrderSettlement(container, input)).plan;
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(JSON.stringify(output));
}
