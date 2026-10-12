import { isDeepStrictEqual } from "node:util";
import { MedusaError } from "@medusajs/framework/utils";
import type Stripe from "stripe";
import { readStripeFactPages } from "./provider-facts";

// source_transaction shares the Charge's transfer_group between sellers. Older
// native transfers used order_id; inspect both scopes and deduplicate the effect.
export async function readOrderTransfers(
  stripe: Pick<Stripe, "transfers">,
  input: {
    order_id: string;
    transfer_group: string;
    group_order_ids?: string[];
  },
): Promise<Stripe.Transfer[]> {
  const groups = [...new Set([input.transfer_group, input.order_id])];
  const pages = await Promise.all(
    groups.map((group) =>
      readStripeFactPages(
        (cursor) =>
          stripe.transfers.list({
            transfer_group: group,
            limit: 100,
            ...(cursor ? { starting_after: cursor } : {}),
          }),
        100,
      ),
    ),
  );
  if (pages.some((page) => !page.complete))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El listado de transferencias está incompleto.",
    );
  const seen = new Map<string, Stripe.Transfer>();
  for (const [index, page] of pages.entries()) {
    for (const transfer of page.data) {
      if (transfer.transfer_group !== groups[index])
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "El grupo de la transferencia no coincide con la consulta.",
        );
      const attributed = transfer.metadata.order_id;
      if (
        groups[index] !== input.order_id &&
        (!attributed ||
          (input.group_order_ids &&
            !input.group_order_ids.includes(attributed)))
      )
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Hay transferencias compartidas sin atribución verificable.",
        );
      if (
        groups[index] === input.order_id &&
        attributed &&
        attributed !== input.order_id
      )
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "La transferencia histórica tiene una atribución contradictoria.",
        );
      const previous = seen.get(transfer.id);
      if (previous && !isDeepStrictEqual(previous, transfer))
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "La transferencia cambió durante la inspección.",
        );
      if (attributed === input.order_id || groups[index] === input.order_id)
        seen.set(transfer.id, transfer);
    }
  }
  return [...seen.values()];
}
