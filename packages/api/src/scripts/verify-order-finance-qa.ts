import assert from "node:assert/strict";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils";
import { readOrderFinance } from "../lib/order-finance/read";
import {
  assertProviderBalances,
  readFinanceProvider,
} from "../lib/order-finance/provider";

/** Read-only verification of this task's explicitly tagged Stripe TEST fixtures. */
export default async function verifyOrderFinanceQa({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    pagination: { take: 100, order: { created_at: "DESC" } },
  });
  const fixtures = orders.filter(
    (order) => order.metadata?.qa === "order-finance-2026-09-12",
  );
  assert.equal(fixtures.length, 4, "Expected only four tagged QA orders");
  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id"],
    pagination: { take: 1 },
  });
  assert.ok(users[0]);
  const checked = new Set<string>();
  for (const fixture of fixtures) {
    const current = await readOrderFinance(container, fixture.id, {
      actor_id: users[0].id,
    });
    const order = current.group.orders.find(
      (order) => order.id === fixture.id,
    )!;
    assert.equal(order.status, "canceled");
    assert.ok(!current.state?.active_token && !current.state?.review_required);
    assert.ok(
      current.view.finance.history.every(
        (entry) => entry.status === "complete",
      ),
    );
    assert.equal(current.view.finance.cancellation.allowed, false);
    assert.equal(current.view.finance.refund.allowed, false);
    const payment = order.cart.payment_collection.payments[0];
    const captured = payment.captures.reduce(
      (sum, capture) => MathBN.add(sum, capture.amount).toNumber(),
      0,
    );
    const refunded = payment.refunds.reduce(
      (sum, refund) => MathBN.add(sum, refund.amount).toNumber(),
      0,
    );
    assert.equal(
      current.view.finance.refunded_total,
      captured ? current.view.finance.allocated_total : 0,
    );
    if (captured) {
      assert.equal(
        order.transactions
          .filter((entry) => entry.reference === "refund")
          .reduce((sum, entry) => MathBN.add(sum, entry.amount).toNumber(), 0),
        -current.view.finance.allocated_total,
      );
      assert.equal(Number(order.total), 0);
    }
    if (!checked.has(payment.id)) {
      const provider = await readFinanceProvider(payment.data.id);
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .info(
          `QA provider balances ${JSON.stringify({ captured, refunded, status: provider.intent.status, received: provider.intent.amount_received, capturable: provider.intent.amount_capturable, refunds: provider.refunds.map((refund) => ({ amount: refund.amount, status: refund.status })) })}`,
        );
      assertProviderBalances(provider, captured, refunded);
      assert.equal(provider.intent.status, captured ? "succeeded" : "canceled");
      assert.equal(captured, captured ? 34 : 0);
      assert.equal(refunded, captured);
      assert.equal(provider.refunds.length, captured ? 3 : 1);
      if (!captured) assert.equal(provider.refunds[0].amount, 3400);
      checked.add(payment.id);
    }
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(
        `QA verified ${JSON.stringify({ order_id: fixture.id, status: order.status, allocated: current.view.finance.allocated_total, refunded: current.view.finance.refunded_total, operations: current.view.finance.history.length })}`,
      );
  }
  assert.equal(checked.size, 2);
}
