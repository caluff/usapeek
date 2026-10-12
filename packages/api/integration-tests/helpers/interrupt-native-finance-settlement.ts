import { randomUUID } from "node:crypto";
import { open, readFile, realpath } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { MercurModules, PayoutStatus } from "@mercurjs/types";
import type { CreatePayoutInput, IPayoutProvider } from "@mercurjs/types";
import {
  prepareOrderSettlement,
  settlementPlanSchema,
} from "../../src/lib/order-finance/settlement-plan";
import {
  settleOrderFinanceWorkflow,
  settleOrderInputSchema,
  type SettleOrderInput,
} from "../../src/workflows/settle-order-finance";
import {
  assertFinanceFixtureEnvironment,
  fixtureCents,
  inspectNativeFinanceFixture,
  nativeFinanceManifestSchema,
  nativeFinancePrivatePath,
  verifyNativeFinanceConservation,
} from "./verify-native-finance-fixture";

type Plan = z.infer<typeof settlementPlanSchema>;
type Checkpoint = (
  status: string,
  evidence?: Record<string, unknown>,
) => Promise<void>;
type NativeProvider = Pick<IPayoutProvider, "createPayout">;
const metadataSchema = z.object({
  finance_operation_id: z.string(),
  order_id: z.string(),
  group_id: z.string(),
  seller_id: z.string(),
});
const transferSchema = z.object({
  id: z.string().startsWith("tr_"),
  object: z.literal("transfer"),
  livemode: z.literal(false),
  currency: z.literal("usd"),
  amount: z.number().int().safe().positive(),
  amount_reversed: z.literal(0),
  created: z.number().int().nonnegative(),
  destination: z.string(),
  source_transaction: z.string(),
  transfer_group: z.string(),
  metadata: metadataSchema,
});

function requireInterruption(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function nativeProvider(service: unknown): NativeProvider {
  requireInterruption(
    typeof service === "object" &&
      service !== null &&
      "payoutProviderService_" in service,
    "The installed native payout provider boundary is unavailable.",
  );
  const provider = service.payoutProviderService_;
  requireInterruption(
    typeof provider === "object" &&
      provider !== null &&
      "createPayout" in provider &&
      typeof provider.createPayout === "function",
    "The installed native payout provider callback is unavailable.",
  );
  return provider as NativeProvider;
}

/** QA-only, in one disposable CLI process. The native callback still performs the transfer. */
export async function interruptNativeSettlement(
  service: unknown,
  rawPlan: Plan,
  rawRequest: SettleOrderInput,
  checkpoint: Checkpoint,
  run: () => Promise<unknown>,
  exit: (code: number) => never = (code) => process.exit(code),
): Promise<never> {
  const plan = settlementPlanSchema.parse(rawPlan);
  const request = settleOrderInputSchema.parse(rawRequest);
  requireInterruption(
    plan.outcome === "transfer_required" && request.order_id === plan.order_id,
    "Interruption requires the selected order's nonzero frozen TEST settlement.",
  );
  const provider = nativeProvider(service);
  const original = provider.createPayout;
  const operationId = `payout:${plan.order_id}`;
  const expectedMetadata = {
    finance_operation_id: operationId,
    order_id: plan.order_id,
    group_id: plan.group_id,
    seller_id: plan.seller_id,
  };
  const matchesMetadata = (value: z.infer<typeof metadataSchema>) =>
    Object.entries(expectedMetadata).every(
      ([key, expected]) => value[key] === expected,
    );
  let attempted = false;
  provider.createPayout = async (input: CreatePayoutInput) => {
    requireInterruption(
      !attempted,
      "The QA provider callback may run only once.",
    );
    const data = z
      .object({
        id: z.string(),
        order_id: z.string(),
        seller_id: z.string(),
        source_transaction: z.string(),
        transfer_group: z.string(),
        metadata: metadataSchema,
      })
      .parse(input.data);
    requireInterruption(
      input.account_id === plan.account_id &&
        input.currency_code === "usd" &&
        typeof input.amount === "number" &&
        fixtureCents(input.amount) === fixtureCents(plan.amount) &&
        input.context?.idempotency_key ===
          `order-finance:${operationId}:transfer` &&
        data.id === plan.destination &&
        data.order_id === plan.order_id &&
        data.seller_id === plan.seller_id &&
        data.source_transaction === plan.source_transaction &&
        data.transfer_group === plan.transfer_group &&
        matchesMetadata(data.metadata),
      "The native request differs from the inspected TEST settlement.",
    );
    attempted = true;
    await checkpoint("provider_requested");
    const response = await original.call(provider, input);
    // Persist only whitelisted observations, including a malformed/wrong response.
    await checkpoint("provider_response", {
      transfer_id: z.string().safeParse(response.data?.id).data ?? null,
      amount_minor: z.number().safeParse(response.data?.amount).data ?? null,
      currency_code: z.string().safeParse(response.data?.currency).data ?? null,
      livemode: z.boolean().safeParse(response.data?.livemode).data ?? null,
    });
    const transfer = transferSchema.parse(response.data);
    requireInterruption(
      response.status === PayoutStatus.PAID &&
        BigInt(transfer.amount) === fixtureCents(plan.amount) &&
        transfer.destination === plan.destination &&
        transfer.source_transaction === plan.source_transaction &&
        transfer.transfer_group === plan.transfer_group &&
        matchesMetadata(transfer.metadata),
      "The observed transfer differs from the frozen TEST settlement; reconcile it.",
    );
    await checkpoint("transfer_verified_before_native_persistence", {
      transfer,
    });
    // A throw would run production catch/finally and release the execution lock.
    // Exit before Mercur's provider await returns to super.createPayouts.
    exit(86);
  };
  try {
    await run();
    throw new Error("The native transfer interruption did not execute.");
  } finally {
    provider.createPayout = original;
  }
}

/**
 * Inspect by default. After F07 normal completes, select its intact sibling with
 * FINANCE_NATIVE_QA_INTERRUPT_ORDER_ID; retain FINANCE_NATIVE_QA_TARGET_ORDER_ID
 * as the F07 target. Execute only with: interrupt <order1> <order2>
 * --execute --crash-after-transfer. FINANCE_NATIVE_QA_INTERRUPT_OUTPUT_PATH must
 * be a new private file. This process deliberately exits 86 with the real fence.
 */
export default async function interruptNativeFinanceSettlement({
  container,
  args,
}: ExecArgs) {
  const phase = z.enum(["inspect", "interrupt"]).parse(args[0] ?? "inspect");
  const options = args.slice(1).filter((argument) => argument.startsWith("--"));
  requireInterruption(
    options.every((option) =>
      ["--execute", "--crash-after-transfer"].includes(option),
    ) &&
      new Set(options).size === options.length &&
      (phase === "inspect" ? options.length === 0 : options.length === 2),
    "Use inspect, or interrupt with both --execute and --crash-after-transfer.",
  );
  const configuration = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  );
  assertFinanceFixtureEnvironment(
    configuration.projectConfig.databaseUrl ?? "invalid:",
    process.env,
    configuration,
  );
  const positional = args
    .slice(1)
    .filter((argument) => !argument.startsWith("--"));
  const ids = z
    .array(z.string().startsWith("order_"))
    .length(2)
    .parse(
      positional.length
        ? positional
        : process.env.FINANCE_NATIVE_QA_ORDER_IDS?.split(","),
    );
  const f07Target = z
    .string()
    .startsWith("order_")
    .parse(process.env.FINANCE_NATIVE_QA_TARGET_ORDER_ID);
  const targetId = z
    .string()
    .startsWith("order_")
    .parse(process.env.FINANCE_NATIVE_QA_INTERRUPT_ORDER_ID);
  requireInterruption(
    ids.includes(f07Target) &&
      ids.includes(targetId) &&
      f07Target !== targetId &&
      process.env.FINANCE_NATIVE_QA_SCENARIO === "normal",
    "F08 requires the explicit intact sibling of the normal F07 checkout.",
  );
  const workspace = await realpath(path.resolve(__dirname, "../../../.."));
  const manifestPath = await nativeFinancePrivatePath(
    process.env.NATIVE_CHECKOUT_MANIFEST_PATH,
    workspace,
    true,
  );
  const manifest = nativeFinanceManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const before = await inspectNativeFinanceFixture(
    container,
    manifest,
    ids,
    f07Target,
  );
  if (phase === "inspect") {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(
      JSON.stringify({
        phase,
        target_order_id: targetId,
        f07_order_id: f07Target,
        ...before.summary,
      }),
    );
    return;
  }
  const refundBefore = fixtureCents(
    process.env.FINANCE_NATIVE_QA_REFUND_BEFORE ?? "2",
  );
  const refundAfter = fixtureCents(
    process.env.FINANCE_NATIVE_QA_REFUND_AFTER ?? "3",
  );
  requireInterruption(
    refundBefore > 0n && refundAfter > 0n,
    "Complete both positive F07 refunds first.",
  );
  verifyNativeFinanceConservation(
    before,
    f07Target,
    refundBefore + refundAfter,
    refundBefore,
    true,
  );
  const target = before.currents[ids.indexOf(targetId)];
  requireInterruption(
    before.currents.every(
      (current) =>
        !current.financialProblem &&
        !current.hasPendingChanges &&
        !current.state?.active_token &&
        !current.state?.review_required &&
        current.operations.every((operation) => operation.state === "complete"),
    ) &&
      !target.payout &&
      target.original &&
      fixtureCents(target.view.finance.refunded_total) === 0n &&
      fixtureCents(target.view.finance.captured_total) ===
        fixtureCents(target.original.gross) &&
      !target.operations.some(
        (operation) =>
          operation.target_id === targetId &&
          ["payout", "refund", "cancel"].includes(operation.kind),
      ) &&
      !before.transfers.some(
        (transfer) => transfer.metadata.order_id === targetId,
      ),
    "Only the fully captured, untouched sibling after completed F07 may be interrupted.",
  );
  const request = settleOrderInputSchema.parse({
    order_id: targetId,
    actor_id: manifest.admin.user_id,
    request_id: randomUUID(),
    note: `Native UI QA ${manifest.run_id}: F08 orphan transfer`,
  });
  const { plan } = await prepareOrderSettlement(container, request);
  const outputPath = await nativeFinancePrivatePath(
    process.env.FINANCE_NATIVE_QA_INTERRUPT_OUTPUT_PATH,
    workspace,
    false,
  );
  const output = await open(outputPath, "wx", 0o600);
  const checkpoint: Checkpoint = async (status, evidence) => {
    await output.appendFile(
      `${JSON.stringify({
        version: 1,
        run_id: manifest.run_id,
        phase: "F08",
        status,
        request,
        plan,
        execution_host: hostname(),
        execution_pid: process.pid,
        evidence,
      })}\n`,
    );
    await output.sync();
  };
  try {
    await checkpoint("prepared");
    await interruptNativeSettlement(
      container.resolve(MercurModules.PAYOUT),
      plan,
      request,
      checkpoint,
      () => settleOrderFinanceWorkflow(container).run({ input: request }),
    );
  } catch {
    await checkpoint("stopped_without_verified_crash").catch(() => undefined);
    throw new Error(
      "F08 stopped without its verified crash; inspect the private receipt and reconcile before another attempt.",
    );
  } finally {
    await output.close();
  }
}
