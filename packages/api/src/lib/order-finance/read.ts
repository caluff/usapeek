import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { validateSellerOrder } from "@mercurjs/core/api/vendor/orders/helpers";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  financeAllocationSchema,
  financeAmount,
  financeGroupSchema,
  financeOperationSchema,
  financeView,
  initialAllocation,
  finalCaptureSchema,
} from "./policy";
import {
  financePayoutSchema,
  settlementReduction,
  verifySettlementHistory,
  type FinancePayout,
} from "./settlement";
import type { OrderFinanceResponse } from "./contracts";
import {
  assertOriginalGroup,
  originalAllocation,
  originalSaleSchema,
  type OriginalSale,
} from "./snapshot";
import { normalizeNativeOrderPayments } from "./native-payments";

export type FinanceActor = {
  actor_id: string;
  seller_id?: string;
  customer_id?: string;
};
const GROUP_FIELDS = [
  "id",
  "cart_id",
  "orders.id",
  "orders.customer_id",
  "orders.version",
  "orders.status",
  "orders.currency_code",
  "orders.total",
  "orders.summary",
  ...["id", "amount", "currency_code", "metadata"].map((field) => `orders.payment_collections.${field}`),
  "orders.seller.id",
  "orders.fulfillments.id",
  "orders.fulfillments.canceled_at",
  // Medusa calculates totals from the loaded line fields. A partial item
  // projection omits quantity/prices and silently produces a zero total.
  "orders.items.*",
  "orders.items.detail.*",
  "orders.items.tax_lines.*",
  "orders.items.adjustments.*",
  "orders.shipping_methods.*",
  "orders.shipping_methods.tax_lines.*",
  "orders.shipping_methods.adjustments.*",
  "orders.credit_lines.*",
  "orders.transactions.id",
  "orders.transactions.amount",
  "orders.transactions.currency_code",
  "orders.transactions.reference",
  "orders.transactions.reference_id",
  "orders.cart.id",
  "orders.cart.payment_collection.id",
  "orders.cart.payment_collection.amount",
  "orders.cart.payment_collection.status",
  "orders.cart.payment_collection.metadata",
  ...[
    "id",
    "amount",
    "provider_id",
    "currency_code",
    "payment_session_id",
    "canceled_at",
    "data",
    "captures.id",
    "captures.amount",
    "refunds.id",
    "refunds.amount",
    "refunds.metadata",
  ].map((field) => `orders.cart.payment_collection.payments.${field}`),
  ...[
    "id", "amount", "provider_id", "currency_code", "payment_session_id",
    "canceled_at", "data", "captures.id", "captures.amount",
    "refunds.id", "refunds.amount", "refunds.metadata",
  ].map((field) => `orders.payment_collections.payments.${field}`),
];

export async function readOrderFinance(
  container: MedusaContainer,
  orderId: string,
  actor: FinanceActor,
  ownedToken?: string,
) {
  if (!actor.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión.",
    );
  if (
    actor.customer_id !== undefined &&
    (!actor.customer_id ||
      actor.customer_id !== actor.actor_id ||
      actor.seller_id !== undefined)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El acceso al pedido no es válido.",
    );
  if (actor.seller_id !== undefined) {
    if (!actor.seller_id)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Selecciona una tienda.",
      );
    await validateSellerOrder(container, actor.seller_id, orderId);
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  if (actor.customer_id !== undefined) {
    const { data: orders } = await query.graph(
      {
        entity: "order",
        fields: ["id", "customer_id"],
        filters: { id: orderId, customer_id: actor.customer_id },
      },
      { cache: { enable: false } },
    );
    if (
      orders.length !== 1 ||
      orders[0].id !== orderId ||
      orders[0].customer_id !== actor.customer_id
    )
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "No encontramos este pedido en tu cuenta.",
      );
  }
  const { data: links } = await query.graph(
    {
      entity: "order_group_order",
      fields: ["order_group_id"],
      filters: { order_id: orderId },
    },
    { cache: { enable: false } },
  );
  if (links.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El pedido no tiene un grupo de compra inequívoco.",
    );
  const { data: groups } = await query.graph(
    {
      entity: "order_group",
      fields: GROUP_FIELDS,
      filters: { id: links[0].order_group_id },
    },
    { cache: { enable: false } },
  );
  const parsed = financeGroupSchema.safeParse(groups[0]);
  if (!parsed.success) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[order-finance] Invalid projection paths: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No se pudo verificar el pago y el reparto de este pedido.",
    );
  }
  let group = parsed.data;
  if (
    actor.customer_id !== undefined &&
    group.orders.find((order) => order.id === orderId)?.customer_id !==
      actor.customer_id
  )
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No encontramos este pedido en tu cuenta.",
    );
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const [states, operations, payoutLinks, pendingChanges, originalRecords, activeReturns] =
    await Promise.all([
      journal.listCommerceGroupStates({ id: group.id }, { take: 1 }),
      journal.listCommerceOperations(
        { group_id: group.id },
        { take: 1001, order: { created_at: "ASC" } },
      ),
      query.graph(
        {
          entity: "payout_seller",
          fields: [
            "seller_id",
            "payout.id",
            "payout.data",
            "payout.status",
            "payout.amount",
            "payout.currency_code",
            "payout.account_id",
            "payout.account.id",
            "payout.account.data",
          ],
          filters: { seller_id: group.orders.map((order) => order.seller.id) },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "order_change",
          fields: ["id"],
          filters: {
            order_id: group.orders.map((order) => order.id),
            status: "pending",
          },
          pagination: { take: 1 },
        },
        { cache: { enable: false } },
      ),
      journal.listFinanceSaleSnapshots({ group_id: group.id }, { take: 51 }),
      query.graph(
        {
          entity: "return",
          fields: ["id"],
          filters: {
            order_id: orderId,
            status: ["open", "requested", "partially_received"],
            canceled_at: null,
          },
          pagination: { take: 1 },
        },
        { cache: { enable: false } },
      ),
    ]);
  if (operations.length > 1000)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Este grupo requiere conciliación del operador.",
    );
  const state = states[0];
  let originals: OriginalSale[] = [];
  let originalProblem: string | null = null;
  try {
    originals = originalRecords.map((record) =>
      originalSaleSchema.parse(record.original),
    );
    assertOriginalGroup(originals, group);
    if (
      originals.some(
        (sale) =>
          sale.allocation.payment_session_id !==
          group.orders[0].cart.payment_collection.payments[0]
            ?.payment_session_id,
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The payment does not belong to the original session.",
      );
    }
  } catch {
    originalProblem =
      "Esta venta no tiene un original financiero verificable. Requiere conciliación; no se aplicará la tasa actual a datos históricos.";
  }
  const allocation =
    state?.observation?.finance_allocation === undefined
      ? !originalProblem
        ? originalAllocation(
            originals,
            group.orders[0].cart.payment_collection.payments[0]?.id ?? "",
          )
        : initialAllocation(group)
      : financeAllocationSchema.parse(state.observation.finance_allocation);
  if (
    !originalProblem &&
    allocation.orders.some((part) => {
      const original = originals.find(
        (sale) => sale.order_id === part.order_id,
      );
      return !original || financeAmount(part.amount) !== original.gross;
    })
  )
    originalProblem = "La asignación guardada difiere del original financiero.";
  const history: OrderFinanceResponse["finance"]["history"] = [];
  const finalCapture =
    state?.observation?.finance_final_capture === undefined
      ? undefined
      : finalCaptureSchema.parse(state.observation.finance_final_capture);
  const knownRefundIds: string[] = [];
  let invalidOperation = false;
  for (const operation of operations) {
    if (!["refund", "cancel", "capture"].includes(operation.kind)) continue;
    const value = financeOperationSchema.safeParse(operation.result);
    if (!value.success) {
      invalidOperation = true;
      continue;
    }
    if (operation.state === "complete")
      knownRefundIds.push(...value.data.refund_ids);
    if (value.data.order_id !== orderId && value.data.action !== "capture")
      continue;
    history.push({
      id: operation.id,
      kind: value.data.action,
      amount:
        value.data.action === "capture"
          ? financeAmount(
              finalCapture?.orders.find((part) => part.order_id === orderId)
                ?.amount ?? 0,
            )
          : financeAmount(value.data.amount),
      status: operation.state,
      note: value.data.note,
      created_at: operation.created_at.toISOString(),
      ...(value.data.settlement &&
      (value.data.settlement.reversal_id || operation.state === "complete")
        ? {
            seller_reversed: financeAmount(
              value.data.settlement.seller_reversed,
            ),
          }
        : {}),
      ...(value.data.settlement && operation.state === "complete"
        ? {
            seller_entitlement_reduced: settlementReduction(
              value.data.settlement,
            ),
            commission_returned: financeAmount(
              value.data.settlement.commission_returned,
            ),
          }
        : {}),
    });
  }
  const nativePayments = normalizeNativeOrderPayments(
    group,
    operations.flatMap((operation) => {
      const result = financeOperationSchema.safeParse(operation.result);
      return result.success ? [{ id: operation.id, result: result.data }] : [];
    }),
    finalCapture?.orders ?? allocation.orders,
  );
  group = nativePayments.group;
  const sellerId = group.orders.find((order) => order.id === orderId)?.seller
    .id;
  const matchingPayouts = payoutLinks.data.filter((link) => {
    if (link.seller_id !== sellerId) return false;
    // A stale module link can remain after its payout was deleted. There is
    // no settlement to attribute when Query returns an absent relation.
    if (link.payout === null || link.payout === undefined) return false;
    const data = link.payout?.data;
    const metadata = financePayoutSchema.shape.data.shape.metadata.safeParse(data?.metadata);
    const attributed = metadata.success ? metadata.data.order_id : undefined;
    const legacy = typeof data?.order_id === "string" ? data.order_id :
      typeof data?.transfer_group === "string" && data.transfer_group.startsWith("order_") ? data.transfer_group : undefined;
    // A shared transfer without an order identity is ambiguous for every order
    // of that seller; it must not disappear from the local payout guard.
    return !(attributed ?? legacy) || (attributed ?? legacy) === orderId;
  });
  let payout: FinancePayout | undefined;
  let payoutProblem: string | null = null;
  if (matchingPayouts.length) {
    const parsedPayout = financePayoutSchema.safeParse(
      matchingPayouts[0].payout,
    );
    if (
      matchingPayouts.length !== 1 ||
      !parsedPayout.success ||
      (parsedPayout.data.data.metadata.order_id ??
        parsedPayout.data.data.transfer_group) !== orderId
    ) {
      payoutProblem =
        "La liquidación de esta tienda requiere conciliación antes del reembolso.";
    } else payout = parsedPayout.data;
  }
  const view = financeView({
    group,
    orderId,
    allocation,
    history,
    knownRefundIds,
    hasPayout: false,
    payoutProblem,
    finalCapture,
    isOperator: actor.seller_id === undefined && actor.customer_id === undefined,
    customerId: actor.customer_id,
    isHeld:
      invalidOperation ||
      Boolean(state?.review_required) ||
      Boolean(state?.active_token && state.active_token !== ownedToken),
  });
  const original = originals.find((sale) => sale.order_id === orderId);
  if (original && view.finance.captured_total > 0) {
    const adjustments = operations.flatMap((operation) => {
      const parsedOperation = financeOperationSchema.safeParse(
        operation.result,
      );
      return operation.state === "complete" &&
        parsedOperation.success &&
        parsedOperation.data.order_id === orderId &&
        parsedOperation.data.settlement
        ? [parsedOperation.data.settlement]
        : [];
    });
    try {
      verifySettlementHistory({
        gross: view.finance.captured_total,
        sellerNet: original.seller_entitlement,
        refunded: view.finance.refunded_total,
        prior: adjustments,
      });
      const reducedBeforeTransfer = adjustments
        .filter((part) => !part.transfer_id)
        .reduce(
          (sum, part) => sum + Math.round(settlementReduction(part) * 100),
          0,
        );
      if (
        payout &&
        Math.round(financeAmount(payout.amount) * 100) !==
          Math.round(original.seller_entitlement * 100) - reducedBeforeTransfer
      )
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED,
          "Transfer principal differs from original less prior adjustments.",
        );
    } catch {
      originalProblem =
        "Los ajustes y la transferencia requieren conciliación con el derecho original de la tienda.";
    }
  }
  const paymentProblem = nativePayments.problem;
  if (originalProblem || paymentProblem) {
    const reason = originalProblem ?? paymentProblem!;
    view.finance.refund = { allowed: false, reason };
    view.finance.capture = {
      ...view.finance.capture,
      allowed: false,
      reason,
    };
    view.finance.cancellation = {
      ...view.finance.cancellation,
      allowed: false,
      reason,
    };
  }
  if (pendingChanges.data.length) {
    const reason =
      "Finaliza o descarta la modificación o devolución pendiente del pedido antes de continuar.";
    view.finance.refund = { allowed: false, reason };
    view.finance.capture = { ...view.finance.capture, allowed: false, reason };
    view.finance.cancellation = {
      ...view.finance.cancellation,
      allowed: false,
      reason,
    };
  }
  if (activeReturns.data.length) {
    const reason =
      "Recibe o cancela la devolución física antes de reembolsar o cancelar este pedido.";
    view.finance.refund = { allowed: false, reason };
    view.finance.cancellation = {
      ...view.finance.cancellation,
      allowed: false,
      reason,
    };
  }
  return {
    group,
    allocation,
    finalCapture,
    payout,
    operations,
    journal,
    state,
    view,
    original,
    originals,
    originalProblem,
    hasPendingChanges:
      pendingChanges.data.length > 0 || activeReturns.data.length > 0,
    financialProblem:
      originalProblem ??
      paymentProblem ??
      payoutProblem ??
      (invalidOperation
        ? "Hay un registro financiero que requiere conciliación."
        : null),
    refundPaymentId: nativePayments.refundPaymentIds.get(orderId) ??
      group.orders[0].cart.payment_collection.payments[0]?.id,
    nativeSplit: nativePayments.nativeSplit,
  };
}
