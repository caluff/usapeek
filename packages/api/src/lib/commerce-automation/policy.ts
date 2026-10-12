import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { PAYOUT_MODULE_OPTION_DEFAULTS, SellerStatus } from "@mercurjs/types";
import { parseISO } from "date-fns/parseISO";
import { isValid } from "date-fns/isValid";

export const MAX_COMMERCE_GROUPS = 25;
export const MAX_COMMERCE_SPLITS = 50;
const decimal = z.union([
  z.number().finite(),
  z.string().regex(/^\d+(?:\.\d+)?$/),
]);
const instant = z.union([z.date(), z.iso.datetime({ offset: true })]);
const account = z.object({
  id: z.string(),
  status: z.string(),
  data: z.object({
    id: z.string(),
    country: z.string(),
    metadata: z.object({ account_id: z.string() }),
  }),
});
// Validate the projection at the automation boundary; missing relationships never mean empty.
export const commerceGroupSchema = z.object({
  id: z.string().min(1),
  cart_id: z.string().min(1),
  created_at: instant,
  orders: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.string(),
        currency_code: z.literal("usd"),
        total: decimal,
        created_at: instant,
        payment_collections: z.array(z.object({ id: z.string() })),
        cart: z.object({
          id: z.string(),
          payment_collection: z.object({
            id: z.string(),
            status: z.string(),
            amount: decimal,
            payments: z.array(
              z.object({
                id: z.string(),
                provider_id: z.string(),
                amount: decimal,
                created_at: instant,
                captured_at: instant.nullable(),
                canceled_at: instant.nullable(),
                captures: z.array(
                  z.object({ id: z.string(), amount: decimal }),
                ),
                refunds: z.array(z.object({ id: z.string(), amount: decimal })),
                data: z.object({ id: z.string(), livemode: z.literal(false) }),
              }),
            ),
          }),
        }),
        seller: z.object({
          id: z.string(),
          status: z.string(),
          payout_account: account.nullable(),
        }),
        items: z
          .array(
            z.object({
              id: z.string(),
              quantity: decimal,
              detail: z.object({ fulfilled_quantity: decimal }),
            }),
          )
          .min(1),
        fulfillments: z.array(
          z.object({ id: z.string(), canceled_at: instant.nullable() }),
        ),
      }),
    )
    .min(1)
    .max(MAX_COMMERCE_SPLITS),
});
export type CommerceGroup = z.infer<typeof commerceGroupSchema>;
export type CommercePlan = {
  groupId: string;
  cartId: string;
  paymentId: string;
  cancelOrderIds: string[];
  holdOrderIds: string[];
  retained: { orderId: string; amount: string }[];
  captureAmount: string;
  captureDue: boolean;
  authorizationExpired: boolean;
  reasons: string[];
};

function timestamp(value: Date | string): number {
  const date = typeof value === "string" ? parseISO(value) : value;
  if (!isValid(date))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Invalid commerce timestamp.",
    );
  return date.getTime();
}

export function usdAmount(value: z.infer<typeof decimal>): string {
  const amount = MathBN.convert(value);
  if (MathBN.lt(amount, 0) || !MathBN.eq(amount, amount.toFixed(2))) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Commerce amounts must be nonnegative exact USD display units.",
    );
  }
  return amount.toFixed(2);
}

export function planCommerceGroup(value: unknown, now: number): CommercePlan {
  const group = commerceGroupSchema.parse(value);
  if (!Number.isFinite(now))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Invalid automation clock.",
    );
  const collection = group.orders[0].cart.payment_collection;
  if (collection.payments.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Ambiguous group payment.",
    );
  const payment = collection.payments[0];
  if (
    payment.provider_id !== "pp_stripe_stripe" ||
    !payment.data.id.startsWith("pi_")
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Unsupported commerce payment provider.",
    );
  }
  const orders = new Set<string>();
  const sellers = new Set<string>();
  const plan: CommercePlan = {
    groupId: group.id,
    cartId: group.cart_id,
    paymentId: payment.id,
    cancelOrderIds: [],
    holdOrderIds: [],
    retained: [],
    captureAmount: "0.00",
    captureDue: false,
    authorizationExpired: false,
    reasons: [],
  };
  const authorizationAge = now - timestamp(payment.created_at);
  if (authorizationAge < 0 || now < timestamp(group.created_at))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Future commerce timestamp.",
    );
  plan.captureDue =
    authorizationAge >=
    PAYOUT_MODULE_OPTION_DEFAULTS.authorizationWindowMs -
      PAYOUT_MODULE_OPTION_DEFAULTS.captureSafetyBufferMs;
  plan.authorizationExpired =
    authorizationAge >= PAYOUT_MODULE_OPTION_DEFAULTS.authorizationWindowMs;
  if (
    collection.status !== "authorized" ||
    payment.captured_at ||
    payment.canceled_at ||
    payment.captures.length ||
    payment.refunds.length
  ) {
    plan.reasons.push("payment_requires_reconciliation");
  }
  let originalTotal = MathBN.convert(0);
  let retainedTotal = MathBN.convert(0);
  for (const order of group.orders) {
    if (
      orders.has(order.id) ||
      sellers.has(order.seller.id) ||
      order.cart.id !== group.cart_id ||
      order.payment_collections.length ||
      order.cart.payment_collection.id !== collection.id ||
      order.cart.payment_collection.payments.length !== 1 ||
      order.cart.payment_collection.payments[0].id !== payment.id
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Unsupported or ambiguous split payment topology.",
      );
    }
    orders.add(order.id);
    sellers.add(order.seller.id);
    const amount = usdAmount(order.total);
    originalTotal = MathBN.add(originalTotal, amount);
    const age = now - timestamp(order.created_at);
    if (age < 0)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Future seller order timestamp.",
      );
    if (order.status === "canceled") continue;
    if (order.status !== "pending") plan.reasons.push("order_requires_review");
    const quantities = order.items.map((item) => {
      if (
        !MathBN.gt(item.quantity, 0) ||
        MathBN.lt(item.detail.fulfilled_quantity, 0) ||
        MathBN.gt(item.detail.fulfilled_quantity, item.quantity)
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Invalid fulfillment quantities.",
        );
      }
      return {
        full: MathBN.eq(item.quantity, item.detail.fulfilled_quantity),
        any: MathBN.gt(item.detail.fulfilled_quantity, 0),
      };
    });
    const hasActiveFulfillment = order.fulfillments.some(
      (fulfillment) => !fulfillment.canceled_at,
    );
    const fullyFulfilled =
      quantities.every((quantity) => quantity.full) && hasActiveFulfillment;
    const partiallyFulfilled =
      !fullyFulfilled &&
      (hasActiveFulfillment || quantities.some((quantity) => quantity.any));
    if (
      age >= PAYOUT_MODULE_OPTION_DEFAULTS.sellerActionWindowMs &&
      partiallyFulfilled
    )
      plan.holdOrderIds.push(order.id);
    if (
      age >= PAYOUT_MODULE_OPTION_DEFAULTS.sellerActionWindowMs &&
      !hasActiveFulfillment &&
      quantities.every((quantity) => !quantity.any) &&
      order.status === "pending"
    ) {
      plan.cancelOrderIds.push(order.id);
      continue;
    }
    retainedTotal = MathBN.add(retainedTotal, amount);
    plan.retained.push({ orderId: order.id, amount });
    if (!fullyFulfilled) plan.reasons.push("fulfillment_pending");
    const payoutAccount = order.seller.payout_account;
    if (
      order.seller.status !== SellerStatus.OPEN ||
      !payoutAccount ||
      payoutAccount.status !== "active" ||
      !payoutAccount.data.id.startsWith("acct_") ||
      payoutAccount.data.country !== "US" ||
      payoutAccount.data.metadata.account_id !== payoutAccount.id
    ) {
      plan.reasons.push("seller_account_not_ready");
    }
  }
  if (
    !MathBN.eq(originalTotal, usdAmount(payment.amount)) ||
    !MathBN.eq(originalTotal, usdAmount(collection.amount))
  ) {
    plan.reasons.push("allocation_requires_reconciliation");
  }
  plan.captureAmount = retainedTotal.toFixed(2);
  if (plan.holdOrderIds.length)
    plan.reasons.push("partial_fulfillment_operator_hold");
  if (plan.authorizationExpired) plan.reasons.push("authorization_expired");
  if (!MathBN.gt(retainedTotal, 0)) plan.reasons.push("no_retained_amount");
  plan.reasons = [...new Set(plan.reasons)];
  return plan;
}
