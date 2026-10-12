import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { validateAndTransformQuery } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MathBN, MedusaError, PolicyOperation } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const FulfillmentStage = z.enum(["pending", "prepared", "shipped"]);
type FulfillmentStage = z.infer<typeof FulfillmentStage>;

const requestedStages = new WeakMap<MedusaRequest, FulfillmentStage>();
export const RefundStatus = z.literal("refunded");
const requestedRefundStatuses = new WeakSet<MedusaRequest>();
const ID_BATCH_SIZE = 500;

function prepareRefundStatus(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!("refund_status" in req.query)) return next();
  if (!RefundStatus.safeParse(req.query.refund_status).success) {
    return next(new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "refund_status must be refunded.",
    ));
  }
  requestedRefundStatuses.add(req);
  delete req.query.refund_status;
  next();
}

async function applyRefundStatus(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!requestedRefundStatuses.delete(req)) return next();
  try {
    const orderIds: unknown = req.filterableFields?.id;
    if (!req.seller_context?.seller_id || !Array.isArray(orderIds) ||
      !orderIds.every((id): id is string => typeof id === "string")) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Order seller scope is required.");
    }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const refundedOrders = new Set<string>();
    for (let offset = 0; offset < orderIds.length; offset += ID_BATCH_SIZE) {
      const scopedIds = orderIds.slice(offset, offset + ID_BATCH_SIZE);
      const { data: transactions } = await query.graph({
        entity: "order_transaction",
        fields: ["order_id", "reference_id", "amount"],
        filters: {
          order_id: scopedIds,
          reference: "refund",
          amount: { $lt: 0 },
          reference_id: { $ne: null },
        },
      }, { cache: { enable: false } });
      const refundIds = [...new Set(transactions.flatMap((transaction) =>
        typeof transaction.reference_id === "string" ? [transaction.reference_id] : [],
      ))];
      const ownedIds = new Set(scopedIds);
      for (let start = 0; start < refundIds.length; start += ID_BATCH_SIZE) {
        const { data: refunds } = await query.graph({
          entity: "refund",
          fields: ["id", "amount"],
          filters: { id: refundIds.slice(start, start + ID_BATCH_SIZE), amount: { $gt: 0 } },
        }, { cache: { enable: false } });
        const refundAmounts = new Map(refunds.map((refund) => [refund.id, refund.amount]));
        for (const transaction of transactions) {
          const amount = refundAmounts.get(transaction.reference_id);
          if (ownedIds.has(transaction.order_id) && amount !== undefined &&
            MathBN.lt(transaction.amount, 0) && MathBN.gt(amount, 0) &&
            MathBN.eq(MathBN.mult(transaction.amount, -1), amount)) {
            refundedOrders.add(transaction.order_id);
          }
        }
      }
    }
    // Refund bookkeeping is assigned to an order only after provider confirmation.
    // Shared cart payment status would include refunds belonging to other sellers.
    // Filter identifiers before the native workflow applies pagination and count.
    req.filterableFields.id = orderIds.filter((id) => refundedOrders.has(id));
    next();
  } catch (error) {
    next(error);
  }
}

function prepareFulfillmentStage(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!("fulfillment_stage" in req.query)) return next();
  const parsed = FulfillmentStage.safeParse(req.query.fulfillment_stage);
  if (!parsed.success) {
    return next(new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "fulfillment_stage must be pending, prepared, or shipped.",
    ));
  }
  requestedStages.set(req, parsed.data);
  // Mercur still validates every native query parameter and applies seller scope.
  // Only this presentation filter is consumed before its strict validator.
  delete req.query.fulfillment_stage;
  next();
}

async function applyFulfillmentStage(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const stage = requestedStages.get(req);
  if (!stage) return next();
  requestedStages.delete(req);

  try {
    const orderIds: unknown = req.filterableFields?.id;
    // Fail closed if native seller-link filtering did not run before this step.
    if (!req.seller_context?.seller_id || !Array.isArray(orderIds) ||
      !orderIds.every((id): id is string => typeof id === "string")) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Order seller scope is required.");
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const preparedOrders = new Set<string>();
    const shippedOrders = new Set<string>();

    for (let offset = 0; offset < orderIds.length; offset += ID_BATCH_SIZE) {
      const { data: links } = await query.graph({
        entity: "order_fulfillment",
        fields: ["order_id", "fulfillment_id"],
        filters: { order_id: orderIds.slice(offset, offset + ID_BATCH_SIZE) },
      }, { cache: { enable: false } });
      const owners = new Map(links.map((link) => [link.fulfillment_id, link.order_id]));
      const fulfillmentIds = [...owners.keys()];

      for (let start = 0; start < fulfillmentIds.length; start += ID_BATCH_SIZE) {
        const ids = fulfillmentIds.slice(start, start + ID_BATCH_SIZE);
        const [{ data: prepared }, { data: shipped }] = await Promise.all([
          query.graph({
            entity: "fulfillment",
            fields: ["id"],
            filters: { id: ids, canceled_at: null, packed_at: { $ne: null } },
          }, { cache: { enable: false } }),
          query.graph({
            entity: "fulfillment",
            fields: ["id"],
            filters: {
              id: ids,
              canceled_at: null,
              $or: [{ shipped_at: { $ne: null } }, { delivered_at: { $ne: null } }],
            },
          }, { cache: { enable: false } }),
        ]);
        for (const fulfillment of prepared) {
          const orderId = owners.get(fulfillment.id);
          if (typeof orderId === "string" && orderId) preparedOrders.add(orderId);
        }
        for (const fulfillment of shipped) {
          const orderId = owners.get(fulfillment.id);
          if (typeof orderId === "string" && orderId) shippedOrders.add(orderId);
        }
      }
    }

    // Only identifiers are intersected. The unchanged native GET/workflow performs
    // the order read, search, sorting, pagination, count and status aggregation.
    req.filterableFields.id = orderIds.filter((id) => {
      if (stage === "shipped") return shippedOrders.has(id);
      if (stage === "prepared") return preparedOrders.has(id) && !shippedOrders.has(id);
      return !preparedOrders.has(id) && !shippedOrders.has(id);
    });
    next();
  } catch (error) {
    next(error);
  }
}

export const vendorOrderStageMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/orders/:id/completion",
    method: "GET",
    middlewares: [validateAndTransformQuery(z.strictObject({}), {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
  {
    // Regex middleware runs before native static-route validation. The exact
    // static middleware below runs after Mercur's seller-link filter.
    matcher: /^\/vendor\/orders\/?$/,
    method: "GET",
    middlewares: [prepareFulfillmentStage, prepareRefundStatus],
  },
  {
    matcher: "/vendor/orders",
    method: "GET",
    middlewares: [applyFulfillmentStage, applyRefundStatus],
  },
];
