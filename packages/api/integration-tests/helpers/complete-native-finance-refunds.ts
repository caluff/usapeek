import { randomUUID } from "node:crypto";
import { open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type Stripe from "stripe";
import { financeOperationSchema } from "../../src/lib/order-finance/policy";
import { financeStripeClient } from "../../src/lib/order-finance/provider";
import { readStripeFactPages } from "../../src/lib/order-finance/provider-facts";
import { operateOrderFinanceWorkflow } from "../../src/workflows/operate-order-finance";
import type { OperateOrderFinanceInput } from "../../src/workflows/steps/operate-order-finance";
import {
  payoutOperationSchema,
  settleOrderFinanceWorkflow,
  type SettleOrderInput,
} from "../../src/workflows/settle-order-finance";
import {
  assertFinanceFixtureEnvironment,
  fixtureCents,
  fixtureEconomics,
  inspectNativeFinanceFixture,
  nativeFinanceManifestSchema,
  nativeFinancePrivatePath,
} from "./verify-native-finance-fixture";

type Inspection = Awaited<ReturnType<typeof inspectNativeFinanceFixture>>;
type Observation = Inspection & { reversals: Stripe.TransferReversal[] };
type Request = OperateOrderFinanceInput | SettleOrderInput;
const phaseSchema = z.enum([
  "inspect",
  "before-settlement",
  "after-settlement",
]);

function requireExtension(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Independent BigInt oracle, including a cent sequence crossing an allocation boundary. */
export function extensionRefundAmounts(
  gross: bigint,
  commission: bigint,
  seller: bigint,
  refunded: bigint,
) {
  const baseline = fixtureEconomics(gross, commission, seller, refunded);
  const amounts: bigint[] = [];
  for (let count = 1; count <= 50; count++) {
    requireExtension(
      refunded + BigInt(count) < gross,
      "Insufficient remaining gross for the cent sequence and final refund.",
    );
    amounts.push(1n);
    const next = fixtureEconomics(
      gross,
      commission,
      seller,
      refunded + BigInt(count),
    );
    if (count >= 2 && next.returned > baseline.returned) {
      return [...amounts, gross - refunded - BigInt(count)];
    }
  }
  throw new Error(
    "The fixture needs more than 50 cent refunds to cross a commission boundary.",
  );
}

function displayAmount(minor: bigint) {
  return Number(`${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`);
}

/** Supports both orders having completed payouts, unlike the initial-cycle runner. */
export function verifyExtendedFinance(inspection: Observation) {
  const { currents, provider, payment, transfers, reversals } = inspection;
  requireExtension(
    currents.every(
      (current) =>
        current.original &&
        !current.financialProblem &&
        !current.hasPendingChanges &&
        !current.state?.active_token &&
        !current.state?.review_required &&
        current.operations.every((operation) => operation.state === "complete"),
    ),
    "Reconcile pending operations, reviews and fences before extension or replay.",
  );
  const capture = inspection.target.finalCapture;
  requireExtension(
    capture &&
      provider.intent.status === "succeeded" &&
      provider.intent.amount_capturable === 0 &&
      payment.captures.length === 1 &&
      payment.captures[0].id === capture.capture_id &&
      fixtureCents(payment.captures[0].amount) ===
        BigInt(provider.intent.amount_received),
    "The shared native capture must be final and match Stripe.",
  );
  const released = new Set(capture.released_refund_ids);
  const releaseRows = provider.refunds.filter((refund) =>
    released.has(refund.id),
  );
  requireExtension(
    released.size === capture.released_refund_ids.length &&
      releaseRows.length === released.size &&
      releaseRows.reduce((sum, refund) => sum + BigInt(refund.amount), 0n) ===
        BigInt(provider.intent.amount - provider.intent.amount_received),
    "Released authorization IDs must explain exactly the uncaptured original amount.",
  );
  const moneyRefunds = provider.refunds.filter(
    (refund) => !released.has(refund.id),
  );
  const knownProviderRefunds = new Set<string>();
  const knownNativeRefunds = new Set<string>();
  const knownTransfers = new Set<string>();
  const knownReversals = new Set<string>();
  let captured = 0n;
  let refunded = 0n;
  for (const current of currents) {
    const original = current.original!;
    const orderId = original.order_id;
    const gross = fixtureCents(original.gross);
    const commission = fixtureCents(original.commission);
    const seller = fixtureCents(original.seller_entitlement);
    const ownCapture = fixtureCents(current.view.finance.captured_total);
    const allocation = capture.orders.find((part) => part.order_id === orderId);
    requireExtension(
      allocation &&
        fixtureCents(allocation.amount) === ownCapture &&
        JSON.stringify(current.finalCapture) === JSON.stringify(capture),
      "Capture allocation changed between orders.",
    );
    captured += ownCapture;
    const history = current.view.finance.history.filter(
      (entry) => entry.kind === "refund",
    );
    const nativeOrder = inspection.group.orders.find(
      (order) => order.id === orderId,
    );
    requireExtension(nativeOrder, "Missing native order accounting.");
    const refundTransactions = nativeOrder.transactions.filter(
      (entry) => entry.reference === "refund",
    );
    const refundCredits = (nativeOrder.credit_lines ?? []).filter(
      (entry) => entry.reference === "refund",
    );
    let expectedCredits = 0;
    let cumulative = 0n;
    let reversed = 0n;
    for (const entry of history) {
      const amount = fixtureCents(entry.amount);
      const prior = fixtureEconomics(gross, commission, seller, cumulative);
      cumulative += amount;
      const next = fixtureEconomics(gross, commission, seller, cumulative);
      const operation = current.operations.find((part) => part.id === entry.id);
      const result = financeOperationSchema.parse(operation?.result);
      requireExtension(
        entry.status === "complete" &&
          operation?.state === "complete" &&
          result.order_id === orderId &&
          result.action === "refund" &&
          fixtureCents(result.amount) === amount &&
          fixtureCents(entry.commission_returned ?? 0) ===
            next.returned - prior.returned &&
          fixtureCents(entry.seller_entitlement_reduced ?? 0) ===
            next.reduced - prior.reduced,
        "Each refund must match the independent cumulative original allocation.",
      );
      const providerRefund = moneyRefunds.find(
        (refund) => refund.id === result.provider_refund_id,
      );
      const nativeRefund = payment.refunds.find(
        (refund) => refund.id === result.refund_ids[0],
      );
      requireExtension(
        providerRefund &&
          providerRefund.status === "succeeded" &&
          providerRefund.currency === "usd" &&
          providerRefund.metadata?.order_id === orderId &&
          providerRefund.metadata.finance_operation_id === entry.id &&
          BigInt(providerRefund.amount) === amount &&
          result.refund_ids.length === 1 &&
          nativeRefund &&
          nativeRefund.metadata?.order_id === orderId &&
          nativeRefund.metadata.finance_operation_id === entry.id &&
          fixtureCents(nativeRefund.amount) === amount &&
          !knownProviderRefunds.has(providerRefund.id) &&
          !knownNativeRefunds.has(nativeRefund.id),
        "A refund must have unique, exact Stripe and native journal references.",
      );
      knownProviderRefunds.add(providerRefund.id);
      knownNativeRefunds.add(nativeRefund.id);
      const transactions = refundTransactions.filter(
        (entry) => entry.reference_id === nativeRefund.id,
      );
      const credits = refundCredits.filter(
        (entry) => entry.reference_id === nativeRefund.id,
      );
      requireExtension(
        result.credit_amount !== undefined,
        "Missing frozen native refund credit.",
      );
      const credit = fixtureCents(result.credit_amount);
      requireExtension(
        transactions.length === 1 &&
          transactions[0].amount < 0 &&
          fixtureCents(-transactions[0].amount) === amount &&
          transactions[0].currency_code === "usd" &&
          (credit > 0n
            ? credits.length === 1 && fixtureCents(credits[0].amount) === credit
            : credits.length === 0),
        "Refund transaction and credit line must match the exact native refund once.",
      );
      if (credit > 0n) expectedCredits++;
      const settlement = result.settlement;
      const ownReversal = fixtureCents(entry.seller_reversed ?? 0);
      if (settlement?.transfer_id && next.reduced > prior.reduced) {
        const reversal = reversals.find(
          (part) => part.id === settlement.reversal_id,
        );
        requireExtension(
          reversal &&
            current.payout &&
            settlement.transfer_id === current.payout.data.id &&
            settlement.payout_id === current.payout.id &&
            settlement.destination === current.payout.account.data.id &&
            reversal.transfer === settlement.transfer_id &&
            reversal.currency === "usd" &&
            reversal.metadata?.order_id === orderId &&
            reversal.metadata.finance_operation_id === entry.id &&
            BigInt(reversal.amount) === next.reduced - prior.reduced &&
            ownReversal === BigInt(reversal.amount) &&
            !knownReversals.has(reversal.id),
          "A post-transfer refund requires its exact cumulative reversal.",
        );
        knownReversals.add(reversal.id);
      } else
        requireExtension(
          ownReversal === 0n && !settlement?.reversal_id,
          "A refund without a seller reversal must not claim one.",
        );
      reversed += ownReversal;
    }
    requireExtension(
      refundTransactions.length === history.length &&
        refundCredits.length === expectedCredits &&
        cumulative === fixtureCents(current.view.finance.refunded_total) &&
        cumulative <= ownCapture,
      "Completed refund history must equal native refunded captured money.",
    );
    refunded += cumulative;
    const economics = fixtureEconomics(gross, commission, seller, cumulative);
    const ownTransfers = transfers.filter(
      (transfer) => transfer.metadata.order_id === orderId,
    );
    const payoutOperation = current.operations.find(
      (operation) => operation.id === `payout:${orderId}`,
    );
    if (!payoutOperation) {
      requireExtension(
        !current.payout && ownTransfers.length === 0 && reversed === 0n,
        "No transfer may exist without a completed settlement plan.",
      );
      continue;
    }
    const payout = payoutOperationSchema.parse(payoutOperation.result);
    const plan = payout.plan;
    const atSettlement = fixtureEconomics(
      gross,
      commission,
      seller,
      fixtureCents(plan.refunded),
    );
    requireExtension(
      plan.order_id === orderId &&
        plan.seller_id === original.seller_id &&
        plan.group_id === inspection.group.id &&
        plan.cart_id === inspection.group.cart_id &&
        plan.payment_id === payment.id &&
        plan.payment_intent_id === provider.intent.id &&
        plan.source_transaction ===
          (typeof provider.intent.latest_charge === "string"
            ? provider.intent.latest_charge
            : provider.intent.latest_charge?.id) &&
        fixtureCents(plan.original_gross) === gross &&
        fixtureCents(plan.original_commission) === commission &&
        fixtureCents(plan.original_seller_entitlement) === seller &&
        fixtureCents(plan.amount) === atSettlement.remainingSeller &&
        fixtureCents(plan.commission_returned) === atSettlement.returned &&
        fixtureCents(plan.seller_entitlement_reduced) ===
          atSettlement.reduced &&
        fixtureCents(plan.refunded) <= cumulative,
      "The frozen settlement must conserve this order's original snapshot.",
    );
    if (plan.outcome === "no_transfer_required") {
      requireExtension(
        !current.payout &&
          ownTransfers.length === 0 &&
          !payout.transfer_attempted &&
          !payout.transfer_id &&
          !payout.payout_id &&
          economics.remainingSeller === 0n &&
          reversed === 0n,
        "Zero settlement must record no provider transfer or native payout.",
      );
      continue;
    }
    const transfer = ownTransfers[0];
    requireExtension(
      current.payout &&
        ownTransfers.length === 1 &&
        transfer &&
        !transfer.livemode &&
        transfer.currency === "usd" &&
        transfer.id === current.payout.data.id &&
        transfer.id === payout.transfer_id &&
        current.payout.id === payout.payout_id &&
        transfer.metadata.seller_id === original.seller_id &&
        transfer.metadata.finance_operation_id === payoutOperation.id &&
        transfer.destination === current.payout.account.data.id &&
        transfer.destination === plan.destination &&
        transfer.source_transaction === plan.source_transaction &&
        transfer.transfer_group === plan.transfer_group &&
        fixtureCents(String(current.payout.amount)) ===
          atSettlement.remainingSeller &&
        BigInt(transfer.amount) === atSettlement.remainingSeller &&
        BigInt(transfer.amount_reversed) === reversed &&
        BigInt(transfer.amount - transfer.amount_reversed) ===
          economics.remainingSeller &&
        reversed === economics.reduced - atSettlement.reduced &&
        !knownTransfers.has(transfer.id),
      "Transfer principal and exact reversals must conserve the original seller entitlement.",
    );
    knownTransfers.add(transfer.id);
  }
  requireExtension(
    captured === BigInt(provider.intent.amount_received) &&
      refunded ===
        moneyRefunds.reduce((sum, refund) => sum + BigInt(refund.amount), 0n) &&
      knownProviderRefunds.size === moneyRefunds.length &&
      knownNativeRefunds.size === payment.refunds.length &&
      knownTransfers.size === transfers.length &&
      knownReversals.size === reversals.length,
    "The shared payment contains missing, duplicate or unattributed financial effects.",
  );
}

function immutableEvidence(inspection: Inspection) {
  return JSON.stringify(inspection.currents.map((current) => current.original));
}

function siblingEvidence(inspection: Observation, targetId: string) {
  return JSON.stringify({
    orders: inspection.summary.orders.filter(
      (order) => order.order_id !== targetId,
    ),
    transfers: inspection.summary.transfers.filter(
      (transfer) => transfer.order_id !== targetId,
    ),
    refunds: inspection.summary.refunds.filter(
      (refund) => refund.order_id !== targetId,
    ),
    reversals: inspection.reversals.filter(
      (reversal) => reversal.metadata?.order_id !== targetId,
    ),
    accounting: inspection.group.orders
      .filter((order) => order.id !== targetId)
      .map((order) => ({
        id: order.id,
        transactions: order.transactions,
        credit_lines: order.credit_lines,
      })),
  });
}

function extensionEvidence(inspection: Observation) {
  return {
    ...inspection.summary,
    originals: inspection.currents.map((current) => current.original),
    reversals: inspection.reversals,
    native_refunds: inspection.payment.refunds,
    accounting: inspection.group.orders.map((order) => ({
      id: order.id,
      transactions: order.transactions,
      credit_lines: order.credit_lines,
    })),
  };
}

/** A rejected/ambiguous operation is never retried by this QA harness. */
export async function executeExtensionRequest<T>(
  run: () => Promise<unknown>,
  inspect: () => Promise<T>,
  verify: (observation: T) => void,
  evidence: (observation: T) => string,
  checkpoint: (status: string, observation?: T) => Promise<void>,
) {
  await checkpoint("submitted");
  await run();
  const observed = await inspect();
  verify(observed);
  await checkpoint("verified", observed);
  await run();
  const repeated = await inspect();
  verify(repeated);
  requireExtension(
    evidence(repeated) === evidence(observed),
    "Replaying the exact completed request changed financial evidence.",
  );
  await checkpoint("idempotency_verified", repeated);
  return repeated;
}

/**
 * PREPARED ONLY. Same isolated environment/manifest/order IDs as the initial runner.
 * Args: inspect|before-settlement|after-settlement [--execute].
 * Every execution requires a new private FINANCE_NATIVE_QA_EXTENSION_OUTPUT_PATH.
 * Before: partial target captured, no refunds/payout; sibling canceled before capture.
 * After: normal target completed refund 2 -> settlement -> refund 3; sibling is stable.
 * Each phase runs the cent sequence and final remainder; before also settles zero.
 */
export default async function completeNativeFinanceRefunds({
  container,
  args,
}: ExecArgs) {
  const configuration = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  );
  assertFinanceFixtureEnvironment(
    configuration.projectConfig.databaseUrl ?? "invalid:",
    process.env,
    configuration,
  );
  const phase = phaseSchema.parse(args[0] ?? "inspect");
  requireExtension(
    args.slice(1).every((argument) => argument === "--execute") &&
      args.filter((argument) => argument === "--execute").length <= 1,
    "Unexpected extension arguments.",
  );
  const execute = args.includes("--execute");
  requireExtension(
    !execute || phase !== "inspect",
    "Inspection cannot execute financial operations.",
  );
  const ids = z
    .array(z.string().startsWith("order_"))
    .length(2)
    .parse(process.env.FINANCE_NATIVE_QA_ORDER_IDS?.split(","));
  const targetId = z
    .string()
    .startsWith("order_")
    .parse(process.env.FINANCE_NATIVE_QA_TARGET_ORDER_ID);
  requireExtension(
    new Set(ids).size === 2 && ids.includes(targetId),
    "Select the target from two unique checkout IDs.",
  );
  const scenario = z
    .enum(["normal", "partial"])
    .parse(process.env.FINANCE_NATIVE_QA_SCENARIO);
  const workspace = await realpath(path.resolve(__dirname, "../../../.."));
  const manifestPath = await nativeFinancePrivatePath(
    process.env.NATIVE_CHECKOUT_MANIFEST_PATH,
    workspace,
    true,
  );
  const manifest = nativeFinanceManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const inspect = async (): Promise<Observation> => {
    const current = await inspectNativeFinanceFixture(
      container,
      manifest,
      ids,
      targetId,
    );
    const stripe = financeStripeClient();
    const rows = await Promise.all(
      current.transfers.map((transfer) =>
        readStripeFactPages(
          (cursor) =>
            stripe.transfers.listReversals(transfer.id, {
              limit: 100,
              ...(cursor ? { starting_after: cursor } : {}),
            }),
          100,
        ),
      ),
    );
    requireExtension(
      rows.every((row) => row.complete),
      "Incomplete provider reversal pagination.",
    );
    return {
      ...current,
      reversals: rows
        .flatMap((row) => row.data)
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  };
  const before = await inspect();
  verifyExtendedFinance(before);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (phase === "inspect") {
    logger.info(JSON.stringify({ phase, scenario, ...before.summary }));
    return;
  }
  const target = before.target;
  const original = target.original!;
  const gross = fixtureCents(original.gross);
  const start = phase === "before-settlement" ? 0n : 500n;
  requireExtension(
    fixtureCents(target.view.finance.captured_total) === gross &&
      fixtureCents(target.view.finance.refunded_total) === start &&
      before.group.orders.find((order) => order.id === targetId)?.status !==
        "canceled",
    "The extension requires complete target capture and its exact initial refund checkpoint.",
  );
  if (phase === "before-settlement") {
    const cancelId = process.env.FINANCE_NATIVE_QA_CANCEL_ORDER_ID;
    const sibling = before.currents.find(
      (current) => current.original!.order_id === cancelId,
    );
    requireExtension(
      scenario === "partial" &&
        cancelId !== targetId &&
        sibling &&
        before.group.orders.find((order) => order.id === cancelId)?.status ===
          "canceled" &&
        fixtureCents(sibling.view.finance.captured_total) === 0n &&
        process.env.FINANCE_NATIVE_QA_BASELINE_CART_ID &&
        before.group.cart_id !==
          process.env.FINANCE_NATIVE_QA_BASELINE_CART_ID &&
        !target.payout &&
        !target.operations.some(
          (operation) => operation.id === `payout:${targetId}`,
        ),
      "Before-settlement requires the distinct partial checkout and its uncaptured canceled sibling.",
    );
  } else {
    const payout = payoutOperationSchema.parse(
      target.operations.find(
        (operation) => operation.id === `payout:${targetId}`,
      )?.result,
    );
    const history = target.view.finance.history.filter(
      (entry) => entry.kind === "refund",
    );
    requireExtension(
      scenario === "normal" &&
        target.payout &&
        fixtureCents(payout.plan.refunded) === 200n &&
        history.length === 2 &&
        fixtureCents(history[0].amount) === 200n &&
        fixtureCents(history[1].amount) === 300n &&
        before.currents.every(
          (current) =>
            fixtureCents(current.view.finance.captured_total) ===
            fixtureCents(current.original!.gross),
        ),
      "After-settlement requires the completed normal refund 2, settlement, refund 3 sequence.",
    );
  }
  const amounts = extensionRefundAmounts(
    gross,
    fixtureCents(original.commission),
    fixtureCents(original.seller_entitlement),
    start,
  );
  const plan = {
    phase,
    scenario,
    target_id: targetId,
    refund_amounts: amounts.map(displayAmount),
    settle_zero: phase === "before-settlement",
  };
  if (!execute) {
    logger.info(JSON.stringify({ ...plan, ...before.summary }));
    return;
  }
  const outputPath = await nativeFinancePrivatePath(
    process.env.FINANCE_NATIVE_QA_EXTENSION_OUTPUT_PATH,
    workspace,
    false,
  );
  const output = await open(outputPath, "wx", 0o600);
  const requests: Request[] = amounts.map((amount) => ({
    order_id: targetId,
    actor_id: manifest.admin.user_id,
    request_id: randomUUID(),
    note: `Native UI QA ${manifest.run_id}: ${phase} refund extension`,
    confirm: true,
    action: "refund",
    amount: displayAmount(amount),
  }));
  if (plan.settle_zero)
    requests.push({
      order_id: targetId,
      actor_id: manifest.admin.user_id,
      request_id: randomUUID(),
      note: `Native UI QA ${manifest.run_id}: zero settlement after full refund`,
    });
  let index = -1;
  const checkpoint = async (status: string, observation?: Observation) => {
    await output.appendFile(
      `${JSON.stringify({
        version: 1,
        run_id: manifest.run_id,
        ...plan,
        group_id: before.group.id,
        cart_id: before.group.cart_id,
        status,
        index,
        request: requests[index],
        ...(index === -1
          ? {
              requests,
              originals: before.currents.map((current) => current.original),
            }
          : {}),
        observation: observation ? extensionEvidence(observation) : undefined,
      })}\n`,
    );
    await output.sync();
  };
  let expected = start;
  try {
    await checkpoint("prepared", before);
    for (index = 0; index < requests.length; index++) {
      const request = requests[index];
      if ("action" in request) expected += amounts[index];
      const run = () =>
        "action" in request
          ? operateOrderFinanceWorkflow(container).run({ input: request })
          : settleOrderFinanceWorkflow(container).run({ input: request });
      await executeExtensionRequest(
        run,
        inspect,
        (observation) => {
          verifyExtendedFinance(observation);
          requireExtension(
            immutableEvidence(observation) === immutableEvidence(before) &&
              siblingEvidence(observation, targetId) ===
                siblingEvidence(before, targetId) &&
              fixtureCents(observation.target.view.finance.refunded_total) ===
                expected,
            "The original snapshots, sibling effects or planned refund amount changed.",
          );
          if (!("action" in request)) {
            const result = payoutOperationSchema.parse(
              observation.target.operations.find(
                (operation) => operation.id === `payout:${targetId}`,
              )?.result,
            );
            requireExtension(
              result.plan.outcome === "no_transfer_required",
              "Full refund must settle without a transfer.",
            );
          }
        },
        (observation) => JSON.stringify(extensionEvidence(observation)),
        checkpoint,
      );
    }
    await checkpoint("complete");
    logger.info(
      JSON.stringify({ ...plan, status: "verified", checkpoint: outputPath }),
    );
  } catch {
    await checkpoint("uncertain").catch(() => undefined);
    throw new Error(
      "Refund extension stopped; inspect its private checkpoint and reconcile before any further execution.",
    );
  } finally {
    await output.close();
  }
}
