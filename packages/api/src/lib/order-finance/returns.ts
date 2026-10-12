import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type { CustomerReturnsResponse } from "./contracts";
import { customerReturnInputSchema } from "./contracts";
import { financeAmount, financeOperationSchema, financeView } from "./policy";
import { readOrderFinance, type FinanceActor } from "./read";
import { validateCartOwnershipWorkflow } from "../../workflows/validate-cart-ownership";

export const customerReturnMetadataSchema = customerReturnInputSchema.extend({
  customer_id: z.string().min(1),
  fingerprint: z.string().min(1),
});

// The public Return DTO omits the persistence field returned by withDeleted.
function isDeletedReturn(entry: object) {
  return "deleted_at" in entry && entry.deleted_at != null;
}

export function assertCustomerReturnMetadataIsReadOnly(metadata: unknown) {
  if (
    metadata === null ||
    (typeof metadata === "object" &&
      metadata !== null &&
      Object.prototype.hasOwnProperty.call(metadata, "usapeek_customer_return"))
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La identidad y el motivo originales de la solicitud del comprador no se pueden modificar.",
    );
}

export async function assertMarketplaceReturnFinance(
  container: MedusaContainer,
  orderId: string,
  actor: FinanceActor,
  ownedToken?: string,
) {
  const current = await readOrderFinance(container, orderId, actor, ownedToken);
  const knownRefundIds = current.operations.flatMap((operation) => {
    if (operation.state !== "complete") return [];
    const parsed = financeOperationSchema.safeParse(operation.result);
    return parsed.success ? parsed.data.refund_ids : [];
  });
  // A native return may have an open order change. Recheck financial integrity
  // independently of that logistical draft, while retaining the group fence.
  const view = financeView({
    group: current.group,
    orderId,
    allocation: current.allocation,
    history: current.view.finance.history,
    knownRefundIds,
    hasPayout: false,
    payoutProblem: current.financialProblem,
    finalCapture: current.finalCapture,
    isHeld:
      Boolean(current.state?.review_required) ||
      Boolean(
        current.state?.active_token &&
        current.state.active_token !== ownedToken,
      ),
  }).finance;
  if (
    !view.refund.allowed &&
    view.refund.reason !== "No queda importe reembolsable en este pedido."
  ) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, view.refund.reason!);
  }
  const order = current.group.orders.find(
    (candidate) => candidate.id === orderId,
  )!;
  const payment = order.cart.payment_collection.payments[0];
  const captureTransactions = order.transactions.filter(
    (transaction) => transaction.reference === "capture",
  );
  if (
    current.financialProblem ||
    current.state?.review_required ||
    (current.state?.active_token &&
      current.state.active_token !== ownedToken) ||
    current.view.finance.history.some(
      (operation) => operation.status !== "complete",
    ) ||
    !["pending", "completed"].includes(order.status) ||
    view.captured_total <= 0 ||
    captureTransactions.length !== 1 ||
    captureTransactions[0].reference_id !== payment.captures[0]?.id ||
    !MathBN.eq(captureTransactions[0].amount, view.captured_total) ||
    !MathBN.lte(order.summary?.pending_difference ?? order.total, 0)
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El cobro de esta tienda debe estar contabilizado y conciliado antes de tramitar la devolución.",
    );
  }
  return current;
}

export async function readCustomerReturns(
  container: MedusaContainer,
  orderId: string,
  customerId: string,
  ownedToken?: string,
): Promise<CustomerReturnsResponse> {
  await validateCartOwnershipWorkflow(container).run({
    input: {
      resource: "order",
      id: orderId,
      customer_id: customerId,
    },
  });
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: orders }, { data: returns }] = await Promise.all([
    query.graph(
      {
        entity: "order",
        fields: [
          "id",
          "customer_id",
          // Native item decoration needs quantity and pricing fields even
          // when the buyer projection only exposes logistical quantities.
          "items.*",
          "items.detail.*",
        ],
        filters: { id: orderId },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "return",
        fields: [
          "id",
          "status",
          "metadata",
          "requested_at",
          "canceled_at",
          "deleted_at",
          "location_id",
        ],
        filters: { order_id: orderId },
        pagination: { take: 101 },
        withDeleted: true,
      },
      { cache: { enable: false } },
    ),
  ]);
  if (orders[0]?.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido no encontrado.");
  }
  const items = (orders[0].items ?? []).flatMap((item) =>
    item
      ? [
          {
            id: item.id,
            title: item.variant_title
              ? `${item.title} · ${item.variant_title}`
              : item.title,
            available_quantity: Math.max(
              0,
              MathBN.sub(
                item.detail?.shipped_quantity ?? 0,
                MathBN.add(
                  item.detail?.return_requested_quantity ?? 0,
                  item.detail?.return_received_quantity ?? 0,
                  item.detail?.return_dismissed_quantity ?? 0,
                ),
              ).toNumber(),
            ),
          },
        ]
      : [],
  );
  let reason: string | null = null;
  try {
    const current = await assertMarketplaceReturnFinance(
      container,
      orderId,
      {
        actor_id: customerId,
        customer_id: customerId,
      },
      ownedToken,
    );
    if (current.hasPendingChanges)
      reason = "Ya hay una gestión pendiente en esta compra.";
    else if (financeAmount(current.view.finance.refundable_total) <= 0)
      reason = "No queda saldo reembolsable en este pedido.";
    else if (!items.some((item) => item.available_quantity > 0))
      reason = "No hay artículos enviados disponibles para devolver.";
  } catch (error) {
    if (
      !(error instanceof MedusaError) ||
      error.type !== MedusaError.Types.NOT_ALLOWED
    )
      throw error;
    reason = error.message;
  }
  if (returns.length > 100)
    reason = "Este pedido requiere revisión del operador.";
  const locationIds = [
    ...new Set(
      returns
        .filter(
          (entry) =>
            entry.requested_at && !entry.canceled_at && !isDeletedReturn(entry),
        )
        .flatMap((entry) => (entry.location_id ? [entry.location_id] : [])),
    ),
  ];
  const { data: destinations } = locationIds.length
    ? await query.graph(
        {
          entity: "stock_location",
          fields: ["id", "name", "address.*"],
          filters: { id: locationIds },
        },
        { cache: { enable: false } },
      )
    : { data: [] };
  const requests: CustomerReturnsResponse["requests"] = returns.flatMap(
    (entry) => {
      const metadata = customerReturnMetadataSchema.safeParse(
        entry.metadata?.usapeek_customer_return,
      );
      const status: CustomerReturnsResponse["requests"][number]["status"] =
        entry.canceled_at || isDeletedReturn(entry) || entry.status === "canceled"
          ? "canceled"
          : !entry.requested_at
            ? "pending"
            : entry.status === "received"
              ? "received"
              : entry.status === "partially_received"
                ? "partially_received"
                : "approved";
      const ownRequest =
        metadata.success && metadata.data.customer_id === customerId
          ? metadata.data
          : null;
      const location = destinations.find(
        (location) => location.id === entry.location_id,
      );
      const address = location?.address;
      const destination =
        ["approved", "partially_received"].includes(status) &&
        address?.address_1
          ? [
              location?.name,
              address.address_1,
              address.address_2,
              address.city,
              address.province,
              address.postal_code,
              address.country_code?.toUpperCase(),
            ]
              .filter(Boolean)
              .join(", ")
          : null;
      return [
        {
          id: entry.id,
          status,
          reason: ownRequest?.reason ?? "store_return",
          note: ownRequest?.note ?? "Devolución gestionada por la tienda.",
          destination,
        },
      ];
    },
  );
  return { eligibility: { allowed: !reason, reason }, items, requests };
}
