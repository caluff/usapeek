import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  inspectOrderFinanceProviderFacts,
  refreshOrderFinanceProviderFactsWorkflow,
  refreshProviderFactsInputSchema,
} from "../workflows/refresh-order-finance-provider-facts";

// medusa exec ./src/scripts/refresh-order-finance-provider-facts.ts
// --args=<order_id> --args=<group_id> --args=<cart_id> --args=<actor_id>
// --args="<reason>" [--args=--execute]
export default async function refreshOrderFinanceProviderFacts({
  container,
  args,
}: ExecArgs) {
  const [orderId, groupId, cartId, actorId, reason, ...options] = args;
  if (options.length > 1 || options.some((option) => option !== "--execute"))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Usa únicamente --execute para persistir una observación nueva; sin esa opción se inspeccionan los datos guardados.",
    );
  const input = refreshProviderFactsInputSchema.parse({
    order_id: orderId,
    group_id: groupId,
    cart_id: cartId,
    actor_id: actorId,
    reason,
  });
  const result = options.length
    ? (await refreshOrderFinanceProviderFactsWorkflow(container).run({ input }))
        .result
    : await inspectOrderFinanceProviderFacts(container, input);
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(JSON.stringify(result, null, 2));
}
