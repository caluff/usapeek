import type { FinanceGroup } from "../policy";
import type { OriginalSale } from "../snapshot";

export function financeGroup(): FinanceGroup {
  const cart: FinanceGroup["orders"][number]["cart"] = {
    id: "cart_shared",
    payment_collection: {
      id: "paycol_shared",
      amount: 150,
      status: "completed",
      payments: [
        {
          id: "pay_shared",
          payment_session_id: "payses_shared",
          provider_id: "pp_stripe_stripe",
          amount: 150,
          canceled_at: null,
          data: { id: "pi_test", livemode: false },
          captures: [{ id: "cap_shared", amount: 150 }],
          refunds: [],
        },
      ],
    },
  };
  return {
    id: "group_shared",
    cart_id: cart.id,
    orders: [70, 80].map((total, index) => ({
      id: `order_${index + 1}`,
      seller: { id: `seller_${index + 1}` },
      status: "pending",
      currency_code: "usd",
      total,
      summary: { pending_difference: 0 },
      payment_collections: [],
      fulfillments: [],
      transactions: [],
      cart,
    })),
  };
}

export function originalSales(group = financeGroup()): OriginalSale[] {
  const originalAmounts = [
    { gross: 70, commission: 5.6, seller_entitlement: 64.4 },
    { gross: 80, commission: 6.4, seller_entitlement: 73.6 },
  ];
  return group.orders.map((order, index) => {
    const amounts = originalAmounts[index];
    if (!amounts)
      throw new Error(
        "The original sales fixture defines exactly two sellers.",
      );
    const itemId = `item_original_${index + 1}`;
    return {
      version: 1,
      policy: "pre-discount-usd-v1",
      rounding: "half-up-order-largest-remainder-anchor",
      refund_policy: "cumulative-proportional-gross-v1",
      order_id: order.id,
      order_version: 1,
      group_id: group.id,
      cart_id: group.cart_id,
      seller_id: order.seller.id,
      currency_code: "usd",
      allocation: {
        payment_collection_id: order.cart.payment_collection.id,
        payment_session_id: "payses_shared",
        amount: amounts.gross,
      },
      components: {
        merchandise_subtotal: amounts.gross,
        merchandise_discount: 0,
        merchandise_tax: 0,
        shipping_subtotal: 0,
        shipping_discount: 0,
        shipping_tax: 0,
        rounding_adjustment: 0,
      },
      lines: [
        {
          id: itemId,
          kind: "item",
          subtotal: amounts.gross,
          discount: 0,
          tax: 0,
        },
      ],
      commission_lines: [
        {
          item_id: itemId,
          shipping_method_id: null,
          commission_rate_id: "rate_original",
          code: "original-8-percent",
          type: "percentage",
          rate: 8,
          base: amounts.gross,
          amount: amounts.commission,
          unrounded_amount: String(amounts.commission),
          include_tax: false,
          include_shipping: false,
          rules: [],
        },
      ],
      ...amounts,
    };
  });
}
