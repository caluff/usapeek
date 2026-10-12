import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils";
import assert from "node:assert/strict";
import { readOrderFinance } from "../lib/order-finance/read";
import {
  assertProviderBalances,
  financeStripeClient,
  readFinanceProvider,
} from "../lib/order-finance/provider";

export default async function inspectFinanceExtensionQa({
  container,
  args,
}: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "version",
      "total",
      "metadata",
      "items.*",
      "items.detail.*",
      "items.tax_lines.*",
      "items.adjustments.*",
      "shipping_methods.*",
      "shipping_methods.tax_lines.*",
      "shipping_methods.adjustments.*",
      "credit_lines.*",
      "cart.payment_collection.id",
      "cart.payment_collection.payments.id",
      "cart.payment_collection.payment_sessions.id",
    ],
    pagination: { take: 100, order: { created_at: "DESC" } },
  });
  const fixtures = data.filter(
    (order) => order.metadata?.qa === "order-finance-extension-2026-09-12",
  );
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id"],
    pagination: { take: 1 },
  });
  assert.ok(users[0]);
  const { data: payouts } = await query.graph({
    entity: "payout",
    fields: ["id", "status", "amount", "currency_code", "data", "account_id"],
    pagination: { take: 100 },
  });
  for (const payout of payouts) {
    if (payout.data?.transfer_group !== "order_01M2BSF13DED9M2EHPFEM3PVCJ")
      continue;
    const { data: links } = await query.graph({
      entity: "payout_seller",
      fields: ["seller_id", "payout_id"],
      filters: { payout_id: payout.id },
    });
    logger.info(
      JSON.stringify({
        qa_payout: {
          id: payout.id,
          status: payout.status,
          amount: payout.amount,
          currency: payout.currency_code,
          transfer_id: payout.data.id,
          order_id: payout.data.transfer_group,
          links,
        },
      }),
    );
  }
  for (const fixture of fixtures) {
    const current = await readOrderFinance(container, fixture.id, {
      actor_id: users[0].id,
    });
    const order = current.group.orders.find(
      (order) => order.id === fixture.id,
    )!;
    const payment = order.cart.payment_collection.payments[0];
    const captured = payment.captures.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );
    const refunded = payment.refunds.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );
    const provider = await readFinanceProvider(payment.data.id);
    if (args[0] === "diagnostic") {
      const transfer =
        fixture.id === "order_01M2BSF13DED9M2EHPFEM3PVCJ"
          ? await financeStripeClient().transfers.retrieve(
              "tr_3UEyopLYDSAMFoVr0xTbO2Wz",
            )
          : undefined;
      logger.info(
        JSON.stringify({
          order_id: fixture.id,
          state: {
            held: Boolean(current.state?.active_token),
            review: current.state?.review_required,
            observation: current.state?.observation,
          },
          operations: current.operations.map((operation) => ({
            id: operation.id,
            state: operation.state,
            result: operation.result,
          })),
          finance: current.view.finance,
          provider: {
            status: provider.intent.status,
            amount: provider.intent.amount,
            received: provider.intent.amount_received,
            capturable: provider.intent.amount_capturable,
            marker:
              provider.intent.metadata.marketplace_final_capture_operation_id,
            refunds: provider.refunds.map((refund) => ({
              id: refund.id,
              amount: refund.amount,
            })),
          },
          captures: payment.captures,
          refunds: payment.refunds.map((refund) => ({
            id: refund.id,
            amount: refund.amount,
          })),
          transactions: order.transactions,
          transfer: transfer && {
            id: transfer.id,
            amount: transfer.amount,
            reversed: transfer.amount_reversed,
            reversals: transfer.reversals.data.map((reversal) => ({
              id: reversal.id,
              amount: reversal.amount,
              operation_id: reversal.metadata?.finance_operation_id,
            })),
          },
        }),
      );
      continue;
    }
    assertProviderBalances(
      provider,
      captured,
      refunded,
      current.finalCapture?.released_refund_ids,
    );
    assert.ok(
      !current.state?.active_token && !current.state?.review_required,
      "Unexpected finance hold",
    );
    assert.ok(
      current.view.finance.history.every(
        (entry) => entry.status === "complete",
      ),
    );
    logger.info(
      JSON.stringify({
        order_id: fixture.id,
        scenario: fixture.metadata?.scenario,
        status: order.status,
        finance: current.view.finance,
        provider: {
          captured,
          refunded,
          received: provider.intent.amount_received,
          capturable: provider.intent.amount_capturable,
          refunds: provider.refunds.map((refund) => ({
            id: refund.id,
            amount: refund.amount,
            status: refund.status,
          })),
        },
        transactions: order.transactions,
      }),
    );
    if (args[0] === "final") {
      assert.equal(current.view.finance.refundable_total, 0);
      assert.equal(current.view.finance.refund.allowed, false);
      assert.equal(current.view.finance.capture.allowed, false);
      assert.equal(captured, fixture.metadata?.scenario === "paid" ? 34 : 12);
      assert.equal(refunded, captured);
      if (current.payout) {
        const transfer = await financeStripeClient().transfers.retrieve(
          current.payout.data.id,
        );
        assert.equal(transfer.amount, 1080);
        assert.equal(transfer.amount_reversed, 1080);
        assert.equal(
          current.view.finance.history.reduce(
            (sum, entry) =>
              MathBN.add(sum, entry.commission_returned ?? 0).toNumber(),
            0,
          ),
          1.2,
        );
        logger.info(
          JSON.stringify({
            transfer_id: transfer.id,
            amount: transfer.amount,
            reversed: transfer.amount_reversed,
            commission_returned: 1.2,
          }),
        );
      }
    }
  }
}
