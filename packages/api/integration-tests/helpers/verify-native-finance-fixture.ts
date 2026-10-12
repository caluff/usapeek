import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { readOrderFinance } from "../../src/lib/order-finance/read";
import {
  financeStripeClient,
  readFinanceProvider,
} from "../../src/lib/order-finance/provider";
import { readOrderTransfers } from "../../src/lib/order-finance/list-order-transfers";
import { requireFinanceOperator } from "../../src/lib/order-finance/settlement-plan";
import { getStripeConnectConfiguration } from "../../src/lib/stripe-connect-configuration";
import { operateOrderFinanceWorkflow } from "../../src/workflows/operate-order-finance";
import type { OperateOrderFinanceInput } from "../../src/workflows/steps/operate-order-finance";
import {
  settleOrderFinanceWorkflow,
  type SettleOrderInput,
} from "../../src/workflows/settle-order-finance";
import { assertNativeFinanceRedis } from "./native-finance-redis-guard";

const phaseSchema = z.enum([
  "inspect",
  "cancel-before-capture",
  "capture",
  "refund-before",
  "settle",
  "refund-after",
]);
const manifestSchema = z.object({
  run_id: z.string().min(1).max(100),
  scenario: z.string().min(1),
  local_only: z.literal(true),
  region_id: z.string(),
  sales_channel_id: z.string(),
  currency_code: z.literal("usd"),
  admin: z.object({ user_id: z.string().min(1) }),
  customers: z.array(z.object({ customer_id: z.string() })).min(1),
  vendors: z
    .array(z.object({ seller_id: z.string(), member_id: z.string() }))
    .length(2),
  products: z
    .array(
      z.object({
        id: z.string(),
        variant_id: z.string(),
        offer_id: z.string(),
        seller_id: z.string(),
      }),
    )
    .min(2),
});
type Manifest = z.infer<typeof manifestSchema>;
function requireFixture(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Independent oracle: decimal parsing and arithmetic never call production finance helpers. */
export function fixtureCents(value: string | number): bigint {
  const text = String(value);
  requireFixture(
    /^\d+(?:\.\d{1,2})?$/.test(text),
    "Expected exact non-negative USD cents.",
  );
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  requireFixture(
    minor <= BigInt(Number.MAX_SAFE_INTEGER),
    "Fixture amount exceeds safe provider integers.",
  );
  return minor;
}
export function fixtureEconomics(
  gross: bigint,
  commission: bigint,
  seller: bigint,
  refunded: bigint,
) {
  requireFixture(
    gross > 0n &&
      commission >= 0n &&
      seller >= 0n &&
      gross === commission + seller &&
      refunded >= 0n &&
      refunded <= gross,
    "Original/refund conservation failed.",
  );
  // Quotient and remainder implement cumulative half-up rounding independently.
  const scaled = commission * refunded;
  const returned = scaled / gross + (2n * (scaled % gross) >= gross ? 1n : 0n);
  const reduced = refunded - returned;
  const remainingSeller = seller - reduced;
  const remainingCommission = commission - returned;
  requireFixture(
    gross - refunded === remainingSeller + remainingCommission,
    "Residual conservation failed.",
  );
  return { returned, reduced, remainingSeller, remainingCommission };
}

export function assertFinanceFixtureEnvironment(
  databaseUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
  configuration?: unknown,
) {
  assertNativeFinanceRedis(environment, configuration);
  const database = new URL(databaseUrl);
  const stripe = getStripeConnectConfiguration(environment);
  requireFixture(
    environment.FINANCE_NATIVE_QA === "disposable-local" &&
      environment.NODE_ENV === "test" &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      !database.search &&
      !database.hash &&
      database.hostname === "localhost" &&
      database.port === "55432" &&
      /^\/closure_browser_[a-z0-9_]+$/.test(database.pathname) &&
      decodeURIComponent(database.username) === "closure_test" &&
      environment.DB_USERNAME === "closure_test" &&
      environment.DB_PORT === "55432" &&
      environment.PGSSLMODE === "require" &&
      environment.NODE_EXTRA_CA_CERTS &&
      existsSync(environment.NODE_EXTRA_CA_CERTS) &&
      environment.NODE_TLS_REJECT_UNAUTHORIZED !== "0" &&
      environment.AUTH_EMAIL_ENABLED === "false" &&
      environment.STRIPE_AUTOMATIC_JOBS_ENABLED === "false" &&
      environment.FINANCE_CHECKOUT_DATA_KIND === "qa_fixture" &&
      !environment.DB_TEMP_NAME &&
      !environment.MEDUSA_DB_SCHEMA &&
      stripe &&
      !stripe.jobsEnabled &&
      environment.NATIVE_CHECKOUT_PRIVATE_OUTPUT === "verified",
    "Native financial verification requires the isolated local TLS/TEST fixture with email and automatic jobs disabled.",
  );
}

async function privatePath(
  value: string | undefined,
  workspace: string,
  existing: boolean,
) {
  requireFixture(
    value && path.isAbsolute(value),
    "Provide an absolute private path.",
  );
  const resolved = existing
    ? await realpath(value)
    : path.join(await realpath(path.dirname(value)), path.basename(value));
  const relative = path.relative(workspace, resolved);
  requireFixture(
    relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative),
    "Private files must resolve outside the worktree.",
  );
  return resolved;
}

async function inspectFixture(
  container: MedusaContainer,
  manifest: Manifest,
  ids: string[],
  targetId: string,
) {
  await requireFinanceOperator(container, manifest.admin.user_id);
  const currents = await Promise.all(
    ids.map((id) =>
      readOrderFinance(container, id, { actor_id: manifest.admin.user_id }),
    ),
  );
  const target = currents[ids.indexOf(targetId)];
  const group = target.group;
  requireFixture(
    ids.length === 2 &&
      new Set(ids).size === 2 &&
      group.orders.length === 2 &&
      group.orders.every((order) => ids.includes(order.id)) &&
      currents.every((current) => current.group.id === group.id),
    "Order IDs must identify exactly one complete two-seller UI checkout.",
  );
  requireFixture(
    new Set(group.orders.map((order) => order.seller.id)).size === 2 &&
      group.orders.every((order) =>
        manifest.vendors.some((vendor) => vendor.seller_id === order.seller.id),
      ),
    "Checkout seller set differs from the manifest.",
  );
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph(
    {
      entity: "order",
      fields: [
        "id",
        "customer_id",
        "region_id",
        "sales_channel_id",
        "metadata",
        "items.product_id",
        "items.variant_id",
        "items.metadata",
      ],
      filters: { id: ids },
    },
    { cache: { enable: false } },
  );
  requireFixture(
    orders.length === 2 &&
      orders.every(
        (order) =>
          manifest.customers.some(
            (customer) => customer.customer_id === order.customer_id,
          ) &&
          order.region_id === manifest.region_id &&
          order.sales_channel_id === manifest.sales_channel_id &&
          order.items?.length &&
          order.items.every(
            (item) =>
              item &&
              manifest.products.some(
                (product) =>
                  product.id === item.product_id &&
                  product.variant_id === item.variant_id &&
                  product.offer_id === item.metadata?.offer_id &&
                  product.seller_id ===
                    group.orders.find((part) => part.id === order.id)?.seller
                      .id,
              ),
          ),
      ),
    "Customer, region, channel, product or offer is outside the UI fixture.",
  );
  for (const current of currents) {
    requireFixture(
      current.original && !current.originalProblem,
      "An immutable original snapshot is required for every order.",
    );
    fixtureEconomics(
      fixtureCents(current.original.gross),
      fixtureCents(current.original.commission),
      fixtureCents(current.original.seller_entitlement),
      0n,
    );
  }
  const payment = group.orders[0].cart.payment_collection.payments[0];
  requireFixture(
    payment &&
      group.orders.every(
        (order) =>
          order.cart.id === group.cart_id &&
          order.cart.payment_collection.payments.length === 1 &&
          order.cart.payment_collection.payments[0].id === payment.id,
      ),
    "The native shared payment is not unique.",
  );
  const provider = await readFinanceProvider(payment.data.id);
  requireFixture(
    provider.intent.metadata.finance_data_kind === "qa_fixture" &&
      provider.intent.capture_method === "manual",
    "Only the trusted server-classified manual TEST intent may be verified.",
  );
  const stripe = financeStripeClient();
  const chargeId =
    typeof provider.intent.latest_charge === "string"
      ? provider.intent.latest_charge
      : provider.intent.latest_charge?.id;
  const charge = chargeId ? await stripe.charges.retrieve(chargeId) : undefined;
  const transfers = charge
    ? (
        await Promise.all(
          ids.map((id) =>
            readOrderTransfers(stripe, {
              order_id: id,
              transfer_group:
                charge.transfer_group ?? `group_${provider.intent.id}`,
              group_order_ids: ids,
            }),
          ),
        )
      ).flat()
    : [];
  const unique = [
    ...new Map(transfers.map((transfer) => [transfer.id, transfer])).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const summary = {
    group_id: group.id,
    cart_id: group.cart_id,
    payment_id: payment.id,
    payment_intent_id: provider.intent.id,
    captured_minor: provider.intent.amount_received,
    capturable_minor: provider.intent.amount_capturable,
    refunds: provider.refunds
      .map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        order_id: refund.metadata?.order_id,
        operation_id: refund.metadata?.finance_operation_id,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    transfers: unique.map((transfer) => ({
      id: transfer.id,
      amount: transfer.amount,
      reversed: transfer.amount_reversed,
      order_id: transfer.metadata.order_id,
      source: transfer.source_transaction,
      destination: transfer.destination,
    })),
    orders: currents.map((current, index) => ({
      order_id: ids[index],
      seller_id: current.original!.seller_id,
      original: {
        gross: current.original!.gross,
        commission: current.original!.commission,
        seller: current.original!.seller_entitlement,
      },
      finance: current.view.finance,
      payout_id: current.payout?.id ?? null,
      financial_problem: current.financialProblem,
      pending_changes: current.hasPendingChanges,
      active_fence: Boolean(current.state?.active_token),
      fulfillment_ids: current.group.orders
        .find((order) => order.id === ids[index])!
        .fulfillments.filter((fulfillment) => !fulfillment.canceled_at)
        .map((fulfillment) => fulfillment.id),
    })),
  };
  return {
    target,
    currents,
    group,
    payment,
    provider,
    transfers: unique,
    summary,
  };
}
type Inspection = Awaited<ReturnType<typeof inspectFixture>>;

function requireCompletedState(inspection: Inspection) {
  requireFixture(
    inspection.currents.every(
      (current) =>
        !current.financialProblem &&
        !current.hasPendingChanges &&
        !current.state?.active_token &&
        !current.state?.review_required &&
        current.operations.every((operation) => operation.state === "complete"),
    ),
    "Inspect and reconcile any pending/uncertain operation before execution or replay.",
  );
}

function verifyConservation(
  inspection: Inspection,
  targetId: string,
  expectedRefund: bigint,
  beforeRefund: bigint,
  expectsPayout: boolean,
) {
  const { target, group, provider, transfers } = inspection;
  const original = target.original!;
  const gross = fixtureCents(original.gross),
    commission = fixtureCents(original.commission),
    seller = fixtureCents(original.seller_entitlement);
  const economics = fixtureEconomics(gross, commission, seller, expectedRefund);
  requireFixture(
    fixtureCents(target.view.finance.refunded_total) === expectedRefund,
    "Order refunded amount differs from the checkpoint plan.",
  );
  const history = target.view.finance.history.filter(
    (entry) => entry.kind === "refund" && entry.status === "complete",
  );
  requireFixture(
    history.reduce(
      (sum, entry) => sum + fixtureCents(entry.commission_returned ?? 0),
      0n,
    ) === economics.returned &&
      history.reduce(
        (sum, entry) =>
          sum + fixtureCents(entry.seller_entitlement_reduced ?? 0),
        0n,
      ) === economics.reduced,
    "Refund allocations do not conserve the immutable G/C/N snapshot.",
  );
  const captured = inspection.currents.reduce(
    (sum, current) => sum + fixtureCents(current.view.finance.captured_total),
    0n,
  );
  const refunded = inspection.currents.reduce(
    (sum, current) => sum + fixtureCents(current.view.finance.refunded_total),
    0n,
  );
  const released = new Set(target.finalCapture?.released_refund_ids ?? []);
  if (target.finalCapture) {
    const releasedRows = provider.refunds.filter((refund) =>
      released.has(refund.id),
    );
    requireFixture(
      released.size === target.finalCapture.released_refund_ids.length &&
        releasedRows.length === released.size &&
        releasedRows.reduce(
          (sum, refund) => sum + BigInt(refund.amount),
          0n,
        ) === BigInt(provider.intent.amount - provider.intent.amount_received),
      "Released authorization refund IDs do not exactly explain the uncaptured original amount.",
    );
  }
  const moneyRefunds = provider.refunds.filter(
    (refund) => !released.has(refund.id),
  );
  requireFixture(
    moneyRefunds.length === history.length &&
      moneyRefunds.every((refund) => {
        const operationId = refund.metadata?.finance_operation_id;
        const entry = history.find((part) => part.id === operationId);
        const operation = target.operations.find(
          (part) => part.id === operationId,
        );
        return (
          refund.metadata?.order_id === targetId &&
          entry &&
          operation?.state === "complete" &&
          operation.result?.provider_refund_id === refund.id &&
          fixtureCents(entry.amount) === BigInt(refund.amount)
        );
      }),
    "Every captured-money refund must match this target's exact completed journal operation.",
  );
  requireFixture(
    BigInt(provider.intent.amount_received) === captured &&
      provider.refunds
        .filter((refund) => !released.has(refund.id))
        .reduce((sum, refund) => sum + BigInt(refund.amount), 0n) === refunded,
    "Shared provider capture/refund totals differ from native allocations.",
  );
  requireFixture(
    inspection.currents.every(
      (current) =>
        current === target ||
        (!current.payout &&
          fixtureCents(current.view.finance.refunded_total) === 0n),
    ),
    "A sibling order has unexpected financial effects.",
  );
  if (!expectsPayout)
    requireFixture(
      !target.payout && transfers.length === 0,
      "An unexpected transfer already exists.",
    );
  else {
    const before = fixtureEconomics(gross, commission, seller, beforeRefund);
    const transfer = transfers[0];
    requireFixture(
      target.payout &&
        transfers.length === 1 &&
        transfer.id === target.payout.data.id &&
        !transfer.livemode &&
        transfer.currency === "usd" &&
        transfer.metadata.order_id === targetId &&
        transfer.metadata.seller_id === original.seller_id &&
        transfer.metadata.finance_operation_id === `payout:${targetId}` &&
        transfer.destination === target.payout.account.data.id &&
        transfer.source_transaction ===
          (typeof provider.intent.latest_charge === "string"
            ? provider.intent.latest_charge
            : provider.intent.latest_charge?.id) &&
        BigInt(transfer.amount) === before.remainingSeller &&
        fixtureCents(String(target.payout.amount)) === before.remainingSeller &&
        BigInt(transfer.amount_reversed) ===
          economics.reduced - before.reduced &&
        BigInt(transfer.amount - transfer.amount_reversed) ===
          economics.remainingSeller,
      "Transfer/reversal does not conserve the original seller entitlement.",
    );
  }
  requireFixture(
    group.orders.every((order) => order.currency_code === "usd"),
    "Currency changed.",
  );
}

/**
 * PREPARED ONLY: run via medusa exec after native UI checkout/vendor fulfillment.
 * Args: [inspect|cancel-before-capture|capture|refund-before|settle|refund-after]
 * [order_id_1 order_id_2] [--execute]. Inspect is the default even for a named phase.
 * Required env: NATIVE_CHECKOUT_MANIFEST_PATH, FINANCE_NATIVE_QA_ORDER_IDS (comma separated,
 * unless supplied in args), FINANCE_NATIVE_QA_TARGET_ORDER_ID, FINANCE_NATIVE_QA_SCENARIO
 * (normal|partial). Partial also requires FINANCE_NATIVE_QA_CANCEL_ORDER_ID and
 * FINANCE_NATIVE_QA_BASELINE_CART_ID, identifying the other, normal UI purchase.
 * Refund defaults are 2 and 3 USD; override FINANCE_NATIVE_QA_REFUND_BEFORE/AFTER.
 * Every execution needs a new private FINANCE_NATIVE_QA_OUTPUT_PATH. Append-only
 * checkpoints persist request IDs before workflows; never automatically resume an
 * ambiguous checkpoint. This helper creates no checkout or fulfillment fixtures.
 */
export default async function verifyNativeFinanceFixture({
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
  const execute = args.includes("--execute");
  const positional = args
    .slice(1)
    .filter((argument) => argument !== "--execute");
  const ids = z
    .array(z.string().startsWith("order_"))
    .length(2)
    .parse(
      positional.length
        ? positional
        : process.env.FINANCE_NATIVE_QA_ORDER_IDS?.split(","),
    );
  const targetId = z
    .string()
    .startsWith("order_")
    .parse(process.env.FINANCE_NATIVE_QA_TARGET_ORDER_ID);
  requireFixture(
    ids.includes(targetId),
    "Select a target order from the explicit checkout IDs.",
  );
  const scenario = z
    .enum(["normal", "partial"])
    .parse(process.env.FINANCE_NATIVE_QA_SCENARIO);
  const cancelId = process.env.FINANCE_NATIVE_QA_CANCEL_ORDER_ID;
  if (scenario === "partial")
    requireFixture(
      cancelId &&
        ids.includes(cancelId) &&
        cancelId !== targetId &&
        process.env.FINANCE_NATIVE_QA_BASELINE_CART_ID,
      "Partial capture requires a distinct cancellation order and normal-checkout baseline cart.",
    );
  const workspace = await realpath(path.resolve(__dirname, "../../../.."));
  const manifestPath = await privatePath(
    process.env.NATIVE_CHECKOUT_MANIFEST_PATH,
    workspace,
    true,
  );
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const inspect = () => inspectFixture(container, manifest, ids, targetId);
  const before = await inspect();
  if (scenario === "partial")
    requireFixture(
      before.group.cart_id !== process.env.FINANCE_NATIVE_QA_BASELINE_CART_ID,
      "Partial capture must use another UI checkout/cart.",
    );
  const refundBefore = fixtureCents(
    process.env.FINANCE_NATIVE_QA_REFUND_BEFORE ?? "2",
  );
  const refundAfter = fixtureCents(
    process.env.FINANCE_NATIVE_QA_REFUND_AFTER ?? "3",
  );
  const gross = fixtureCents(before.target.original!.gross);
  requireFixture(
    refundBefore > 0n && refundAfter > 0n && refundBefore + refundAfter < gross,
    "Refund phases must be positive and together below original gross.",
  );
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (!execute) {
    logger.info(JSON.stringify({ scenario, phase, ...before.summary }));
    return;
  }
  requireFixture(
    phase !== "inspect",
    "Inspection cannot execute money operations.",
  );
  requireCompletedState(before);
  const order = before.group.orders.find((part) => part.id === targetId)!;
  const canceled = before.group.orders.find((part) => part.id === cancelId);
  const refundExpected =
    phase === "refund-after" || phase === "settle" ? refundBefore : 0n;
  verifyConservation(
    before,
    targetId,
    refundExpected,
    refundBefore,
    phase === "refund-after",
  );
  if (phase === "cancel-before-capture")
    requireFixture(
      scenario === "partial" &&
        canceled?.status !== "canceled" &&
        before.provider.intent.amount_received === 0 &&
        !before.payment.captures.length,
      "Cancel only the explicit sibling before capture.",
    );
  else if (phase === "capture") {
    requireFixture(
      before.provider.intent.amount_received === 0 &&
        !before.payment.captures.length &&
        (scenario === "normal"
          ? before.group.orders.every((part) => part.status !== "canceled")
          : canceled?.status === "canceled"),
      "Capture requires the intended normal/partial cancellation state.",
    );
    requireFixture(
      before.group.orders
        .filter((part) => part.status !== "canceled")
        .every(
          (part) =>
            part.fulfillments.some((fulfillment) => !fulfillment.canceled_at) &&
            part.items?.length &&
            part.items.every(
              (item) =>
                Number(item.detail.fulfilled_quantity) >= Number(item.quantity),
            ),
        ),
      "Complete native vendor fulfillment before manual capture.",
    );
  } else
    requireFixture(
      order.status !== "canceled" &&
        fixtureCents(before.target.view.finance.captured_total) === gross,
      "Refund/settlement requires the target's complete native capture.",
    );
  const outputPath = await privatePath(
    process.env.FINANCE_NATIVE_QA_OUTPUT_PATH,
    workspace,
    false,
  );
  const output = await open(outputPath, "wx", 0o600);
  const request = {
    order_id: phase === "cancel-before-capture" ? cancelId! : targetId,
    actor_id: manifest.admin.user_id,
    request_id: randomUUID(),
    note: `Native UI QA ${manifest.run_id}: ${phase}`,
    confirm: true as const,
  };
  const operation: OperateOrderFinanceInput | SettleOrderInput =
    phase === "settle"
      ? request
      : {
          ...request,
          action:
            phase === "capture"
              ? ("capture" as const)
              : phase === "cancel-before-capture"
                ? ("cancel" as const)
                : ("refund" as const),
          ...(["refund-before", "refund-after"].includes(phase)
            ? {
                amount:
                  Number(
                    phase === "refund-before" ? refundBefore : refundAfter,
                  ) / 100,
              }
            : {}),
        };
  const checkpoint = async (status: string, observation?: unknown) => {
    await output.appendFile(
      `${JSON.stringify({ version: 1, run_id: manifest.run_id, scenario, phase, status, request: operation, group_id: before.group.id, cart_id: before.group.cart_id, observation })}\n`,
    );
    await output.sync();
  };
  const run = () =>
    "action" in operation
      ? operateOrderFinanceWorkflow(container).run({ input: operation })
      : settleOrderFinanceWorkflow(container).run({ input: operation });
  try {
    await checkpoint("prepared", before.summary);
    await checkpoint("submitted");
    await run();
    const after = await inspect();
    requireCompletedState(after);
    const expected =
      phase === "refund-before"
        ? refundBefore
        : phase === "refund-after"
          ? refundBefore + refundAfter
          : refundExpected;
    verifyConservation(
      after,
      targetId,
      expected,
      refundBefore,
      phase === "settle" || phase === "refund-after",
    );
    if (phase === "capture")
      requireFixture(
        after.provider.intent.amount_capturable === 0 &&
          after.currents.every((current, index) => {
            const expectedCapture =
              scenario === "partial" && ids[index] === cancelId
                ? 0n
                : fixtureCents(current.original!.gross);
            const allocated = current.finalCapture?.orders.find(
              (part) => part.order_id === ids[index],
            );
            return (
              fixtureCents(current.view.finance.captured_total) ===
                expectedCapture &&
              allocated &&
              fixtureCents(String(allocated.amount)) === expectedCapture
            );
          }),
        "Final capture allocation did not close the authorization correctly.",
      );
    if (phase === "cancel-before-capture")
      requireFixture(
        after.group.orders.find((part) => part.id === cancelId)?.status ===
          "canceled" && after.provider.intent.amount_received === 0,
        "Pre-capture cancellation was not verified.",
      );
    await checkpoint("verified", after.summary);
    // A completed, observed business request may be replayed to prove deduplication.
    // An exception before this boundary never triggers another workflow invocation.
    await run();
    const repeated = await inspect();
    requireCompletedState(repeated);
    requireFixture(
      JSON.stringify(repeated.summary) === JSON.stringify(after.summary),
      "Replaying the same completed request changed financial facts.",
    );
    await checkpoint("idempotency_verified", repeated.summary);
    logger.info(
      JSON.stringify({
        run_id: manifest.run_id,
        scenario,
        phase,
        status: "verified",
        checkpoint: outputPath,
        ...repeated.summary,
      }),
    );
  } catch {
    await checkpoint("uncertain").catch(() => undefined);
    throw new Error(
      `Native financial QA stopped during ${phase}; inspect its private checkpoint and reconcile before another execution.`,
    );
  } finally {
    await output.close();
  }
}

export {
  manifestSchema as nativeFinanceManifestSchema,
  inspectFixture as inspectNativeFinanceFixture,
  privatePath as nativeFinancePrivatePath,
  verifyConservation as verifyNativeFinanceConservation,
};
