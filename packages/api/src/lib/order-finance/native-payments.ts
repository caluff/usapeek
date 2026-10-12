import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  financeAllocationSchema,
  financeAmount,
  type FinanceGroup,
  type FinanceAllocation,
  type FinanceOperation,
} from "./policy";

export const CAPTURE_ALLOCATION_METADATA_KEY = "usapeek_capture_allocation";
export const nativeCaptureAllocationSchema = z.object({
  version: z.literal(1),
  amount: z.number().transform(financeAmount),
  orders: financeAllocationSchema.shape.orders,
});
type Refund =
  FinanceGroup["orders"][number]["cart"]["payment_collection"]["payments"][number]["refunds"][number];

function requireIdentity(value: unknown): asserts value {
  if (!value)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Los pagos propios del pedido requieren conciliación de identidad e importes.",
    );
}

// Own Medusa payments represent shares of the same provider charge. Keep the
// original cart payment as the accounting anchor without adding its money twice.
export function normalizeNativeOrderPayments(
  source: FinanceGroup,
  verifiedOperations: Array<{ id: string; result: FinanceOperation }> = [],
  expectedAmounts?: FinanceAllocation["orders"],
) {
  const collection = source.orders[0].cart.payment_collection;
  const shared = collection.payments[0];
  const refundPaymentIds = new Map<string, string>();
  const frozenValue = collection.metadata?.[CAPTURE_ALLOCATION_METADATA_KEY];
  const hasOwn = source.orders.some(
    (order) => order.payment_collections.length,
  );
  if (!hasOwn && frozenValue === undefined)
    return {
      group: source,
      refundPaymentIds,
      nativeSplit: false,
      problem: null,
    };
  try {
    requireIdentity(shared && collection.payments.length === 1);
    requireIdentity(shared.captures.length <= 1);
    const captured = shared.captures.reduce(
      (sum, capture) =>
        MathBN.add(sum, financeAmount(capture.amount)).toNumber(),
      0,
    );
    const frozen =
      frozenValue === undefined
        ? undefined
        : nativeCaptureAllocationSchema.parse(frozenValue);
    if (frozen) {
      requireIdentity(
        frozen.orders.length === source.orders.length &&
          new Set(frozen.orders.map((part) => part.order_id)).size ===
            source.orders.length &&
          frozen.orders.every((part) =>
            source.orders.some((order) => order.id === part.order_id),
          ) &&
          MathBN.eq(
            frozen.orders.reduce(
              (sum, part) =>
                MathBN.add(sum, financeAmount(part.amount)).toNumber(),
              0,
            ),
            frozen.amount,
          ) &&
          (captured === 0 || MathBN.eq(frozen.amount, captured)),
      );
    }
    requireIdentity(
      frozen || collection.metadata?.split_order_collections === true,
    );
    const ids = new Set([
      collection.id,
      shared.id,
      ...shared.captures.map((capture) => capture.id),
    ]);
    const refunds: Refund[] = [];
    const byId = new Map<string, Refund>();
    const byProviderId = new Map<string, Refund>();
    function appendRefund(refund: Refund, orderId?: string) {
      if (orderId) requireIdentity(refund.metadata?.order_id === orderId);
      const operation = verifiedOperations.find(
        (entry) =>
          entry.id === refund.metadata?.finance_operation_id &&
          entry.result.order_id === refund.metadata?.order_id &&
          MathBN.eq(entry.result.amount, refund.amount),
      );
      const providerId =
        typeof refund.metadata?.stripe_refund_id === "string" &&
        refund.metadata.stripe_refund_id ===
          operation?.result.provider_refund_id
          ? refund.metadata.stripe_refund_id
          : undefined;
      if (refund.metadata?.stripe_refund_id !== undefined)
        requireIdentity(
          providerId && refund.metadata.stripe_refund_id === providerId,
        );
      const repeated = byId.get(refund.id);
      requireIdentity(
        !repeated ||
          (MathBN.eq(repeated.amount, refund.amount) &&
            repeated.metadata?.order_id === refund.metadata?.order_id &&
            repeated.metadata?.finance_operation_id ===
              refund.metadata?.finance_operation_id),
      );
      if (repeated) return;
      const providerDuplicate = providerId
        ? byProviderId.get(providerId)
        : undefined;
      if (providerDuplicate) {
        requireIdentity(
          providerId?.startsWith("re_") &&
            MathBN.eq(providerDuplicate.amount, refund.amount) &&
            providerDuplicate.metadata?.order_id ===
              refund.metadata?.order_id &&
            providerDuplicate.metadata?.finance_operation_id ===
              refund.metadata?.finance_operation_id,
        );
        // Keep the identity already committed to the journal when two native
        // records demonstrably refer to its one verified provider refund.
        if (
          operation?.result.refund_ids.includes(refund.id) &&
          !operation.result.refund_ids.includes(providerDuplicate.id)
        ) {
          refunds[refunds.indexOf(providerDuplicate)] = refund;
          byProviderId.set(providerId!, refund);
        }
        byId.set(refund.id, refund);
        return;
      }
      refunds.push(refund);
      byId.set(refund.id, refund);
      if (providerId) byProviderId.set(providerId, refund);
    }
    for (const refund of shared.refunds) appendRefund(refund);
    let ownCaptured = 0;
    let complete = collection.metadata?.split_order_collections === true;
    const orders = source.orders.map((order) => {
      requireIdentity(
        order.cart.id === source.cart_id &&
          order.cart.payment_collection.id === collection.id,
      );
      const expected = (frozen?.orders ?? expectedAmounts)?.find(
        (part) => part.order_id === order.id,
      )?.amount;
      if (!order.payment_collections.length) {
        if (
          captured > 0 &&
          (expected === undefined
            ? order.status !== "canceled"
            : !MathBN.eq(expected, 0))
        )
          complete = false;
        return order;
      }
      requireIdentity(order.payment_collections.length === 1 && captured > 0);
      const ownCollection = order.payment_collections[0];
      const own = ownCollection.payments?.[0];
      requireIdentity(
        own &&
          ownCollection.payments?.length === 1 &&
          ownCollection.metadata?.cart_payment_collection_id ===
            collection.id &&
          ownCollection.currency_code === "usd" &&
          own.currency_code === "usd" &&
          own.provider_id === shared.provider_id &&
          own.data.id === shared.data.id &&
          !own.canceled_at &&
          own.captures.length <= 1 &&
          ownCollection.amount !== undefined &&
          MathBN.eq(ownCollection.amount, own.amount),
      );
      for (const id of [
        ownCollection.id,
        own.id,
        ...own.captures.map((capture) => capture.id),
      ]) {
        requireIdentity(id && !ids.has(id));
        ids.add(id);
      }
      const ownCapture = own.captures[0];
      if (!ownCapture) complete = false;
      else {
        requireIdentity(
          MathBN.gt(ownCapture.amount, 0) &&
            !MathBN.gt(ownCapture.amount, own.amount) &&
            (expected === undefined || MathBN.eq(ownCapture.amount, expected)),
        );
        ownCaptured = MathBN.add(
          ownCaptured,
          financeAmount(ownCapture.amount),
        ).toNumber();
      }
      for (const refund of own.refunds) appendRefund(refund, order.id);
      requireIdentity(
        !MathBN.gt(
          own.refunds.reduce(
            (sum, refund) =>
              MathBN.add(sum, financeAmount(refund.amount)).toNumber(),
            0,
          ),
          ownCapture?.amount ?? 0,
        ),
      );
      refundPaymentIds.set(order.id, own.id);
      const captures = order.transactions.filter(
        (transaction) => transaction.reference === "capture",
      );
      requireIdentity(
        captures.length <= 1 &&
          captures.every(
            (transaction) =>
              ownCapture &&
              transaction.reference_id === ownCapture.id &&
              transaction.currency_code === "usd" &&
              MathBN.eq(transaction.amount, ownCapture.amount),
          ),
      );
      if (ownCapture && !captures.length) complete = false;
      return {
        ...order,
        payment_collections: [],
        transactions: order.transactions.map((transaction) =>
          transaction.reference === "capture"
            ? { ...transaction, reference_id: shared.captures[0].id }
            : transaction,
        ),
      };
    });
    requireIdentity(!MathBN.gt(ownCaptured, captured));
    if (!MathBN.eq(ownCaptured, captured)) complete = false;
    requireIdentity(
      !MathBN.gt(
        refunds.reduce(
          (sum, refund) =>
            MathBN.add(sum, financeAmount(refund.amount)).toNumber(),
          0,
        ),
        captured,
      ),
    );
    const group: FinanceGroup = {
      ...source,
      orders: orders.map((order) => ({
        ...order,
        cart: {
          ...order.cart,
          payment_collection: {
            ...collection,
            payments: [{ ...shared, refunds }],
          },
        },
      })),
    };
    return {
      group,
      refundPaymentIds,
      nativeSplit: true,
      problem:
        complete || captured === 0
          ? null
          : "El reparto nativo de la captura todavía requiere conciliación.",
    };
  } catch {
    return {
      group: source,
      refundPaymentIds: new Map<string, string>(),
      nativeSplit: true,
      problem:
        "Los pagos propios del pedido requieren conciliación de identidad e importes.",
    };
  }
}
