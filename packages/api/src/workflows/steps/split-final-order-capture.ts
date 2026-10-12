import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { splitCapturedCartPaymentWorkflow } from "@mercurjs/core/workflows";
import {
  CAPTURE_ALLOCATION_METADATA_KEY,
  nativeCaptureAllocationSchema,
} from "../../lib/order-finance/native-payments";
import {
  financeAmount,
  type FinanceAllocation,
} from "../../lib/order-finance/policy";
import { readOrderFinance } from "../../lib/order-finance/read";
import { freezeFinalCaptureAllocationWorkflow } from "../order-finance-native";

export async function freezeFinalCaptureAllocation(
  container: MedusaContainer,
  current: Awaited<ReturnType<typeof readOrderFinance>>,
  orders: FinanceAllocation["orders"],
) {
  const collection = current.group.orders[0].cart.payment_collection;
  const allocation = nativeCaptureAllocationSchema.parse({
    version: 1,
    amount: orders.reduce(
      (sum, part) => MathBN.add(sum, financeAmount(part.amount)).toNumber(),
      0,
    ),
    orders: orders.map((part) => ({
      order_id: part.order_id,
      amount: financeAmount(part.amount),
    })),
  });
  const previous = collection.metadata?.[CAPTURE_ALLOCATION_METADATA_KEY];
  if (previous !== undefined) {
    const parsed = nativeCaptureAllocationSchema.parse(previous);
    if (
      !MathBN.eq(parsed.amount, allocation.amount) ||
      parsed.orders.length !== allocation.orders.length ||
      parsed.orders.some(
        (part) =>
          !allocation.orders.some(
            (next) =>
              next.order_id === part.order_id &&
              MathBN.eq(next.amount, part.amount),
          ),
      )
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El reparto final ya congelado difiere de la recuperación.",
      );
    return;
  }
  await freezeFinalCaptureAllocationWorkflow(container).run({
    input: {
      collection_id: collection.id,
      metadata: {
        ...collection.metadata,
        [CAPTURE_ALLOCATION_METADATA_KEY]: allocation,
      },
    },
  });
}

export async function splitFinalOrderCapture(
  container: MedusaContainer,
  input: {
    current: Awaited<ReturnType<typeof readOrderFinance>>;
    orders: FinanceAllocation["orders"];
    captureId: string;
    actorId: string;
    token: string;
  },
) {
  await splitCapturedCartPaymentWorkflow(container).run({
    input: { cart_id: input.current.group.cart_id },
  });
  const fresh = await readOrderFinance(
    container,
    input.current.group.orders[0].id,
    { actor_id: input.actorId },
    input.token,
  );
  if (
    !fresh.nativeSplit ||
    fresh.financialProblem ||
    input.orders.some((part) => {
      const order = fresh.group.orders.find(
        (entry) => entry.id === part.order_id,
      );
      const captures =
        order?.transactions.filter(
          (transaction) => transaction.reference === "capture",
        ) ?? [];
      return financeAmount(part.amount) === 0
        ? captures.length !== 0
        : captures.length !== 1 ||
            captures[0].reference_id !== input.captureId ||
            !MathBN.eq(captures[0].amount, part.amount);
    })
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El reparto nativo no confirmó la captura de cada tienda.",
    );
}
