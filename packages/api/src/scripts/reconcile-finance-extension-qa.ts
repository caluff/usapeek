import assert from "node:assert/strict";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { cancelOrderWorkflow } from "@medusajs/core-flows";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { readOrderFinance } from "../lib/order-finance/read";
import { financeOperationSchema } from "../lib/order-finance/policy";
import {
  assertProviderBalances,
  financeStripeClient,
  readFinanceProvider,
} from "../lib/order-finance/provider";
import { performFinalOrderCapture } from "../workflows/steps/final-order-capture";
import {
  createOrderCreditLinesWorkflow,
  recordAllocatedRefundWorkflow,
  refundAllocatedPaymentWorkflow,
} from "../workflows/order-finance-native";

const CASES = {
  capture: {
    order: "order_01M2BSAKW2C49RGPZE3Q3N7C5N",
    group: "og_01M2BSAHVEXKVWPQJMT319ZNX8",
    operation:
      "capture:order_01M2BSAKW2C49RGPZE3Q3N7C5N:6fb6360b-11ee-4e67-a4d0-6c7538fff36d",
  },
  refund: {
    order: "order_01M2BSF13DED9M2EHPFEM3PVCJ",
    group: "og_01M2BSEYZ65KJH9N21WTPX16N5",
    operation:
      "cancel:order_01M2BSF13DED9M2EHPFEM3PVCJ:cde5de94-60a6-4073-bc91-3c18e304c88b",
  },
};
const reconcileFinanceQaStep = createStep(
  "reconcile-finance-qa",
  async (scenario: keyof typeof CASES, { container }) => {
    assert.equal(process.env.NODE_ENV, "development");
    const target = CASES[scenario];
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const journal = container.resolve<CommerceAutomationService>(
      COMMERCE_AUTOMATION_MODULE,
    );
    const { data: fixtures } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: target.order },
    });
    assert.equal(
      fixtures[0]?.metadata?.qa,
      "order-finance-extension-2026-09-12",
    );
    const { data: users } = await query.graph({
      entity: "user",
      fields: ["id"],
      pagination: { take: 1 },
    });
    assert.ok(users[0]);
    const [state] = await journal.listCommerceGroupStates({ id: target.group });
    assert.ok(
      state?.active_token,
      "Only the exact interrupted QA operation may be reconciled",
    );
    const token = state.active_token;
    const current = await readOrderFinance(
      container,
      target.order,
      { actor_id: users[0].id },
      token,
    );
    const operation = current.operations.find(
      (item) => item.id === target.operation,
    )!;
    assert.ok(operation && operation.state !== "complete");
    const result = financeOperationSchema.parse(operation.result);
    const order = current.group.orders.find(
      (item) => item.id === target.order,
    )!;
    const payment = order.cart.payment_collection.payments[0];
    const provider = await readFinanceProvider(payment.data.id);
    if (scenario === "capture") {
      assert.equal(operation.state, "uncertain");
      assert.equal(provider.intent.status, "requires_capture");
      assert.equal(provider.intent.amount, 3400);
      assert.equal(provider.intent.amount_capturable, 3400);
      assert.equal(provider.intent.amount_received, 0);
      assert.equal(provider.refunds.length, 0);
      assert.equal(payment.captures.length, 0);
      assert.equal(payment.refunds.length, 0);
      assert.equal(current.view.finance.capture.amount, 12);
      try {
        // Explicitly inspected no-effect case. The corrected single-capture
        // protocol has its own stable key; the original request was rejected.
        await performFinalOrderCapture(container, {
          current,
          token,
          operationId: operation.id,
          actorId: users[0].id,
        });
      } catch (error) {
        const detail = error as {
          type?: string;
          code?: string;
          param?: string;
          message?: string;
        };
        container.resolve(ContainerRegistrationKeys.LOGGER).error(
          JSON.stringify({
            type: detail.type,
            code: detail.code,
            param: detail.param,
            message: detail.message?.slice(0, 300),
          }),
        );
        throw new Error(
          "QA capture reconciliation stopped; the durable hold remains.",
        );
      }
      await journal.updateCommerceOperations({
        selector: { id: operation.id, token, state: "uncertain" },
        data: { state: "complete", result },
      });
      await journal.updateCommerceGroupStates({
        selector: { id: target.group, active_token: token },
        data: { review_required: false },
      });
    } else {
      assert.equal(operation.state, "processing");
      assert.equal(state.review_required, false);
      assert.equal(result.refund_ids.length, 0);
      assert.equal(result.amount, 11);
      assert.equal(
        result.settlement?.reversal_id,
        "trr_1UEz1OLYDSAMFoVr72aOh7uA",
      );
      const transfer = await financeStripeClient().transfers.retrieve(
        "tr_3UEyopLYDSAMFoVr0xTbO2Wz",
      );
      assert.equal(transfer.livemode, false);
      assert.equal(transfer.transfer_group, target.order);
      assert.equal(transfer.amount, 1080);
      assert.equal(transfer.amount_reversed, 1080);
      assert.equal(transfer.reversals.has_more, false);
      assert.equal(transfer.reversals.data.length, 2);
      assert.ok(
        transfer.reversals.data.some(
          (item) =>
            item.id === result.settlement?.reversal_id &&
            item.amount === 990 &&
            item.metadata?.finance_operation_id === operation.id,
        ),
      );
      assert.equal(payment.captures.length, 1);
      assert.equal(Number(payment.captures[0].amount), 34);
      assert.equal(payment.refunds.length, 1);
      assert.equal(Number(payment.refunds[0].amount), 1);
      assertProviderBalances(provider, 34, 1);
      assert.equal(provider.refunds.length, 1);
      // The server was stopped after the persisted reversal and before creating
      // a refund. Resume only that missing native step; never reverse again.
      const { result: updated } = await refundAllocatedPaymentWorkflow(
        container,
      ).run({
        input: {
          payment_id: payment.id,
          amount: 11,
          created_by: users[0].id,
          note: result.note,
          metadata: { order_id: order.id, finance_operation_id: operation.id },
        },
      });
      const created =
        updated.refunds?.filter(
          (item) => !payment.refunds.some((prior) => prior.id === item.id),
        ) ?? [];
      assert.equal(created.length, 1);
      assert.equal(Number(created[0].amount), 11);
      result.refund_ids = [created[0].id];
      await journal.updateCommerceOperations({
        selector: { id: operation.id, token, state: "processing" },
        data: { result },
      });
      assertProviderBalances(
        await readFinanceProvider(payment.data.id),
        34,
        12,
      );
      await recordAllocatedRefundWorkflow(container).run({
        input: {
          order_id: order.id,
          amount: -11,
          currency_code: "usd",
          reference: "refund",
          reference_id: created[0].id,
        },
      });
      const owed = Math.max(0, -(order.summary?.pending_difference ?? 0));
      const credit = Math.max(0, MathBN.sub(11, owed).toNumber());
      if (credit)
        await createOrderCreditLinesWorkflow(container).run({
          input: {
            id: order.id,
            credit_lines: [
              {
                amount: credit,
                reference: "refund",
                reference_id: created[0].id,
              },
            ],
          },
        });
      await cancelOrderWorkflow(container).run({
        input: { order_id: order.id, canceled_by: users[0].id },
      });
      await journal.finishOperation(operation.id, token, "complete", result);
    }
    await journal.releaseGroup(target.group, token);
    return new StepResponse({ order_id: target.order, reconciled: true });
  },
);
const reconcileFinanceQaWorkflow = createWorkflow(
  "reconcile-finance-qa",
  (input: keyof typeof CASES) =>
    new WorkflowResponse(reconcileFinanceQaStep(input)),
);

/** One-off recovery of two inspected TEST fixtures, not a general unblock tool. */
export default async function reconcileFinanceExtensionQa({
  container,
  args,
}: ExecArgs) {
  assert.ok(
    args.length === 1 && (args[0] === "capture" || args[0] === "refund"),
  );
  const { result } = await reconcileFinanceQaWorkflow(container).run({
    input: args[0] as keyof typeof CASES,
  });
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(JSON.stringify(result));
}
