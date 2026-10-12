import { open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  refreshOrderCommissionLinesWorkflow,
  updateCommissionRatesWorkflow,
} from "@mercurjs/core/workflows";
import { CommissionRateType, MercurModules } from "@mercurjs/types";
import type { CommissionLineDTO, CommissionRateDTO } from "@mercurjs/types";
import type Stripe from "stripe";
import type CommissionModuleService from "../../src/modules/commission/service";
import type { OriginalSale } from "../../src/lib/order-finance/snapshot";
import { financeStripeClient } from "../../src/lib/order-finance/provider";
import {
  observeStripeFinanceFacts,
  providerFinanceCostSchema,
  type ProviderFactsObservation,
  type ProviderFinanceFact,
} from "../../src/lib/order-finance/provider-facts";
import {
  readOrderFinanceReportingSources,
  type FinanceReportingSources,
} from "../../src/lib/order-finance/record-provider-facts";
import {
  assertFinanceFixtureEnvironment,
  inspectNativeFinanceFixture,
  nativeFinanceManifestSchema,
  nativeFinancePrivatePath,
} from "./verify-native-finance-fixture";

const manifestSchema = nativeFinanceManifestSchema.extend({
  commission_rate_id: z.string().startsWith("comrate_"),
});
type Manifest = z.infer<typeof manifestSchema>;
type Inspection = Awaited<ReturnType<typeof inspectNativeFinanceFixture>>;
const phaseSchema = z.enum(["inspect", "rate", "costs"]);

type NativeCostGuardDetails = {
  fact_kind: ProviderFinanceFact["kind"] | null;
  fact_amount_minor: number | null;
  fact_provider_id: string | null;
  transaction_id: string | null;
  source_id: string | null;
  amount_minor: number | null;
  fee_minor: number | null;
  net_minor: number | null;
  status: "available" | "pending" | "unknown";
};

class NativeFinanceQaGuardError extends Error {
  constructor(
    message: string,
    readonly details?: NativeCostGuardDetails,
  ) {
    super(message);
  }
}

function requireQa(
  value: unknown,
  message: string,
  details?: NativeCostGuardDetails,
): asserts value {
  if (!value) throw new NativeFinanceQaGuardError(message, details);
}

/** Only this helper's literal guard messages may enter receipts or logs. */
export function nativeFinanceQaFailure(error: unknown) {
  return error instanceof NativeFinanceQaGuardError
    ? {
        kind: "qa_guard" as const,
        reason: error.message,
        ...(error.details ? { details: error.details } : {}),
      }
    : { kind: "external_or_unclassified" as const };
}

type CostStage =
  | "provider_account"
  | "capture_reference"
  | "provider_observation"
  | "observed_scope"
  | "persisted_reporting"
  | "cost_comparison"
  | "shared_cost_consistency";

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

function costGuardDetails(
  fact: ProviderFinanceFact | undefined,
  transaction: Stripe.BalanceTransaction,
): NativeCostGuardDetails {
  const safeId = (value: string | null | undefined) =>
    value && /^(?:ch|py|txn|re|tr|trr)_[A-Za-z0-9]+$/.test(value)
      ? value
      : null;
  const minor = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) ? value : null;
  return {
    fact_kind: fact?.kind ?? null,
    fact_amount_minor: minor(fact?.amount_minor),
    fact_provider_id: safeId(fact?.provider_id),
    transaction_id: safeId(transaction.id),
    source_id: safeId(objectId(transaction.source)),
    amount_minor: minor(transaction.amount),
    fee_minor: minor(transaction.fee),
    net_minor: minor(transaction.net),
    status:
      transaction.status === "available" || transaction.status === "pending"
        ? transaction.status
        : "unknown",
  };
}

export function assertNativeQaRate(
  manifest: Manifest,
  rate: CommissionRateDTO,
  originals: OriginalSale[],
  expectedValue: 10 | 12,
) {
  const products = new Set(manifest.products.map((product) => product.id));
  const rules = rate.rules ?? [];
  requireQa(
    products.size === manifest.products.length &&
      rate.id === manifest.commission_rate_id &&
      rate.name === `QA checkout ${manifest.run_id}` &&
      rate.code.startsWith("qa-checkout-") &&
      z.uuid().safeParse(rate.code.slice("qa-checkout-".length)).success &&
      rate.type === CommissionRateType.PERCENTAGE &&
      rate.value === expectedValue &&
      rate.currency_code === "usd" &&
      rate.is_enabled === true &&
      rate.is_default === false &&
      rate.include_tax === false &&
      rate.include_shipping === false &&
      rate.deleted_at === null &&
      rate.values?.length === 0 &&
      rules.length === products.size &&
      new Set(rules.map((rule) => rule.id)).size === rules.length &&
      new Set(rules.map((rule) => rule.reference_id)).size === products.size &&
      rules.every(
        (rule) =>
          rule.reference === "product" &&
          products.has(rule.reference_id) &&
          rule.commission_rate_id === rate.id &&
          rule.deleted_at === null,
      ),
    "Only the manifest's exact enabled QA product commission rule may be inspected or changed.",
  );
  requireQa(
    originals.length === 4 &&
      new Set(originals.map((original) => original.order_id)).size === 4 &&
      originals.every(
        (original) =>
          original.commission_lines.length > 0 &&
          original.commission_lines.every(
            (line) =>
              line.commission_rate_id === rate.id &&
              line.code === rate.code &&
              line.type === "percentage" &&
              line.rate === 10 &&
              !line.include_tax &&
              !line.include_shipping,
          ),
      ),
    "All four immutable checkout snapshots must retain the original QA ten-percent rule.",
  );
}

export function assertNativeRateScope(groups: Inspection[], ids: string[]) {
  requireQa(
    ids.length === 4 &&
      new Set(ids).size === 4 &&
      groups.length === 2 &&
      groups[0].group.id !== groups[1].group.id &&
      groups[0].group.cart_id !== groups[1].group.cart_id &&
      groups[0].payment.id !== groups[1].payment.id &&
      groups[0].provider.intent.id !== groups[1].provider.intent.id &&
      groups.every(
        (group, index) =>
          group.currents.length === 2 &&
          group.group.orders.length === 2 &&
          group.currents.every(
            (current) =>
              current.original &&
              ids
                .slice(index * 2, index * 2 + 2)
                .includes(current.original.order_id) &&
              !current.financialProblem &&
              !current.hasPendingChanges &&
              !current.state?.active_token &&
              !current.state?.review_required &&
              current.operations.every(
                (operation) => operation.state === "complete",
              ),
          ),
      ) &&
      groups[0].group.orders.every((order) => order.status !== "canceled") &&
      groups[1].group.orders.filter((order) => order.status === "canceled")
        .length <= 1,
    "Rate/cost QA requires two distinct complete checkout groups with four stable manifest orders.",
  );
}

async function inspectGroups(
  container: MedusaContainer,
  manifest: Manifest,
  ids: string[],
) {
  const groups = await Promise.all(
    [0, 2].map((offset) =>
      inspectNativeFinanceFixture(
        container,
        manifest,
        ids.slice(offset, offset + 2),
        ids[offset],
      ),
    ),
  );
  assertNativeRateScope(groups, ids);
  return groups;
}

async function rateEvidence(
  container: MedusaContainer,
  manifest: Manifest,
  ids: string[],
) {
  const groups = await inspectGroups(container, manifest, ids);
  const originals = groups
    .flatMap((group) => group.currents.map((current) => current.original!))
    .sort((a, b) => a.order_id.localeCompare(b.order_id));
  const commission = container.resolve<CommissionModuleService>(
    MercurModules.COMMISSION,
  );
  const anchors = originals.flatMap((original) =>
    original.commission_lines.map((line) =>
      line.item_id
        ? { item_id: line.item_id }
        : { shipping_method_id: line.shipping_method_id! },
    ),
  );
  const [rate, lines] = await Promise.all([
    commission.retrieveCommissionRate(manifest.commission_rate_id, {
      relations: ["rules", "values"],
    }),
    commission.listCommissionLines(
      { $or: anchors },
      { take: 10001, order: { id: "ASC" } },
    ),
  ]);
  requireQa(
    lines.length < 10001,
    "Commission rows exceed the bounded QA inspection.",
  );
  assertNativeCommissionRows(originals, lines);
  return { groups, originals, rate: rate as CommissionRateDTO, lines };
}
type RateEvidence = Awaited<ReturnType<typeof rateEvidence>>;

export function assertNativeCommissionRows(
  originals: OriginalSale[],
  lines: CommissionLineDTO[],
) {
  const expected = originals.flatMap((original) => original.commission_lines);
  requireQa(
    lines.length === expected.length &&
      new Set(lines.map((line) => line.id)).size === lines.length &&
      expected.every((part) => {
        const matches = lines.filter(
          (line) =>
            line.item_id === part.item_id &&
            line.shipping_method_id === part.shipping_method_id,
        );
        const line = matches[0];
        return (
          matches.length === 1 &&
          line.deleted_at === null &&
          line.commission_rate_id === part.commission_rate_id &&
          line.code === part.code &&
          Number(line.rate) === part.rate &&
          Number(line.amount) === part.amount
        );
      }),
    "Native commission rows must exactly preserve every immutable original anchor and amount.",
  );
}

function rateInvariant(evidence: RateEvidence) {
  return {
    originals: evidence.originals,
    lines: evidence.lines,
    financial: evidence.groups.map((group) => group.summary),
  };
}

/** Every workflow is checkpointed before submission; failures never trigger retry or rollback. */
export async function executeNativeRateChange<T>(input: {
  before: T;
  update: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
  inspect: () => Promise<T>;
  verify: (observation: T) => void;
  checkpoint: (status: string, observation?: T) => Promise<void>;
}) {
  await input.checkpoint("prepared", input.before);
  await input.checkpoint("rate_update_submitted");
  await input.update();
  const changed = await input.inspect();
  input.verify(changed);
  await input.checkpoint("rate_update_verified", changed);
  await input.checkpoint("commission_refresh_submitted");
  await input.refresh();
  const refreshed = await input.inspect();
  input.verify(refreshed);
  await input.checkpoint("verified", refreshed);
  return refreshed;
}

const factIdentity = (fact: ProviderFinanceFact) => ({
  key: fact.key,
  kind: fact.kind,
  account_id: fact.account_id,
  mode: fact.mode,
  group_id: fact.group_id,
  provider_id: fact.provider_id,
  charge_id: fact.charge_id,
  payment_intent_id: fact.payment_intent_id,
  transfer_id: fact.transfer_id,
  destination_account_id: fact.destination_account_id,
  amount_minor: fact.amount_minor,
  currency_code: fact.currency_code,
  balance_transaction_id: fact.balance_transaction_id,
  provider_operation_id: fact.provider_operation_id,
  provider_order_id: fact.provider_order_id,
  provider_seller_id: fact.provider_seller_id,
  provider_transfer_group: fact.provider_transfer_group,
});

type PartialCaptureCostContext = {
  charge: Stripe.Charge;
  refunds: Stripe.Refund[];
  authorization_release_refund_ids: string[];
};

/** Independently prove Stripe's gross debit/released-authorization ledger layout. */
function matchesPartialCaptureBalance(
  fact: ProviderFinanceFact,
  transaction: Stripe.BalanceTransaction,
  facts: ProviderFinanceFact[],
  transactions: Stripe.BalanceTransaction[],
  context?: PartialCaptureCostContext,
) {
  if (!context || fact.kind !== "capture") return false;
  const {
    charge,
    refunds,
    authorization_release_refund_ids: releaseIds,
  } = context;
  if (
    charge.id !== fact.provider_id ||
    charge.id !== fact.charge_id ||
    objectId(charge.balance_transaction) !== transaction.id ||
    !fact.payment_intent_id ||
    objectId(charge.payment_intent) !== fact.payment_intent_id ||
    charge.currency !== "usd" ||
    charge.livemode !== false ||
    !charge.paid ||
    !charge.captured ||
    !Number.isSafeInteger(charge.amount) ||
    !Number.isSafeInteger(charge.amount_captured) ||
    charge.amount_captured <= 0 ||
    charge.amount <= charge.amount_captured ||
    charge.amount_captured !== fact.amount_minor ||
    transaction.amount !== charge.amount ||
    !["available", "pending"].includes(transaction.status) ||
    new Set(refunds.map((refund) => refund.id)).size !== refunds.length ||
    new Set(releaseIds).size !== releaseIds.length ||
    releaseIds.some((id) => !refunds.some((refund) => refund.id === id))
  )
    return false;
  const releases = refunds.filter(
    (refund) =>
      refund.reason === "expired_uncaptured_charge" ||
      releaseIds.includes(refund.id),
  );
  const releaseFacts = facts.filter(
    (row) => row.kind === "authorization_release",
  );
  if (!releases.length || releaseFacts.length !== releases.length) return false;
  const balanceIds = new Set<string>([transaction.id]);
  let released = 0n;
  let signedReleases = 0n;
  for (const refund of releases) {
    const matches = releaseFacts.filter((row) => row.provider_id === refund.id);
    const release = matches[0];
    const balanceId = objectId(refund.balance_transaction);
    if (
      refund.status !== "succeeded" ||
      refund.currency !== "usd" ||
      objectId(refund.charge) !== charge.id ||
      objectId(refund.payment_intent) !== fact.payment_intent_id ||
      !Number.isSafeInteger(refund.amount) ||
      refund.amount <= 0 ||
      matches.length !== 1 ||
      release.account_id !== fact.account_id ||
      release.group_id !== fact.group_id ||
      release.provider !== fact.provider ||
      release.mode !== fact.mode ||
      release.charge_id !== fact.charge_id ||
      release.payment_intent_id !== fact.payment_intent_id ||
      release.currency_code !== "usd" ||
      release.amount_minor !== refund.amount ||
      release.effect_status !== "confirmed" ||
      release.reconciliation_status === "conflict" ||
      !balanceId ||
      release.balance_transaction_id !== balanceId ||
      balanceIds.has(balanceId) ||
      facts.filter((row) => row.balance_transaction_id === balanceId).length !==
        1
    )
      return false;
    const balance = transactions.find((row) => row.id === balanceId);
    if (
      !balance ||
      objectId(balance.source) !== refund.id ||
      balance.currency !== "usd" ||
      !["available", "pending"].includes(balance.status) ||
      ![balance.amount, balance.fee, balance.net].every(Number.isSafeInteger) ||
      BigInt(balance.amount) !== -BigInt(refund.amount) ||
      BigInt(balance.net) !== BigInt(balance.amount) - BigInt(balance.fee) ||
      !balance.fee_details.every(
        (fee) => fee.currency === "usd" && Number.isSafeInteger(fee.amount),
      ) ||
      (balance.status === "available" &&
        balance.fee_details.reduce(
          (sum, fee) => sum + BigInt(fee.amount),
          0n,
        ) !== BigInt(balance.fee))
    )
      return false;
    balanceIds.add(balanceId);
    released += BigInt(refund.amount);
    signedReleases += BigInt(balance.amount);
  }
  return (
    released === BigInt(charge.amount) - BigInt(charge.amount_captured) &&
    BigInt(transaction.amount) + signedReleases === BigInt(fact.amount_minor)
  );
}

/** Contrast raw Stripe balance transactions with persisted costs; this function never writes. */
export function contrastNativeProviderCosts(
  observed: ProviderFactsObservation,
  stored: FinanceReportingSources,
  transactions: Stripe.BalanceTransaction[],
  context?: PartialCaptureCostContext,
) {
  const issues = [...stored.coverage.issues];
  const issue = (resource: string, reason: string) =>
    issues.push({ resource, reason });
  for (const entry of observed.coverage.issues)
    if (!["unattributed", "data_kind_unknown"].includes(entry.reason))
      issues.push(entry);
  if (!stored.coverage.complete && !stored.coverage.issues.length)
    issue("reporting", "coverage_incomplete");
  requireQa(
    new Set(observed.facts.map((fact) => fact.key)).size ===
      observed.facts.length &&
      new Set(stored.facts.map((fact) => fact.key)).size ===
        stored.facts.length &&
      new Set(stored.costs.map((cost) => cost.key)).size ===
        stored.costs.length &&
      new Set(transactions.map((transaction) => transaction.id)).size ===
        transactions.length,
    "Duplicate provider facts, costs or balance transactions cannot be reconciled.",
  );
  for (const fact of observed.facts) {
    const persisted = stored.facts.find((row) => row.key === fact.key);
    if (
      !persisted ||
      !isDeepStrictEqual(factIdentity(persisted), factIdentity(fact))
    )
      issue(fact.key, "persisted_fact_missing_or_changed");
    if (fact.kind !== "authorization_release" && !fact.balance_transaction_id)
      issue(fact.key, "cost_reference_missing");
  }
  for (const fact of stored.facts)
    if (!observed.facts.some((row) => row.key === fact.key))
      issue(fact.key, "provider_fact_not_observed");
  const expectedKeys = new Set(
    observed.facts.flatMap((fact) =>
      fact.balance_transaction_id
        ? [
            `stripe:test:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`,
          ]
        : [],
    ),
  );
  for (const cost of stored.costs)
    if (!expectedKeys.has(cost.key))
      issue(cost.key, "unattributed_persisted_cost");
  const rows = [...expectedKeys].sort().map((key) => {
    const record = stored.costs.find((cost) => cost.key === key);
    const persisted = record
      ? providerFinanceCostSchema.parse(record)
      : undefined;
    const sourceFacts = observed.facts.filter(
      (fact) =>
        fact.balance_transaction_id &&
        key ===
          `stripe:test:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`,
    );
    const transaction = transactions.find(
      (row) => row.id === sourceFacts[0].balance_transaction_id,
    );
    if (!transaction) issue(key, "balance_transaction_unavailable");
    if (!persisted) issue(key, "persisted_cost_missing");
    const source = objectId(transaction?.source);
    const fact = sourceFacts.find(
      (row) =>
        row.provider_id === source ||
        (row.kind === "reversal" &&
          row.transfer_id !== null &&
          row.transfer_id === source),
    );
    if (transaction) {
      const details = costGuardDetails(fact, transaction);
      const sign =
        fact &&
        ["refund", "authorization_release", "transfer"].includes(fact.kind)
          ? -1n
          : 1n;
      requireQa(
        fact,
        "Raw balance transaction source has no matching observed movement.",
        details,
      );
      requireQa(
        transaction.currency === "usd",
        "Raw balance transaction currency is not USD.",
        details,
      );
      requireQa(
        [transaction.amount, transaction.fee, transaction.net].every(
          Number.isSafeInteger,
        ),
        "Raw balance transaction amount, fee or net is not a safe integer.",
        details,
      );
      requireQa(
        BigInt(transaction.amount) === BigInt(fact.amount_minor) * sign ||
          matchesPartialCaptureBalance(
            fact,
            transaction,
            observed.facts,
            transactions,
            context,
          ),
        "Raw balance transaction signed amount differs from the observed movement.",
        details,
      );
      requireQa(
        BigInt(transaction.net) ===
          BigInt(transaction.amount) - BigInt(transaction.fee),
        "Raw balance transaction net differs from amount minus fee.",
        details,
      );
      requireQa(
        transaction.fee_details.every(
          (fee) => fee.currency === "usd" && Number.isSafeInteger(fee.amount),
        ),
        "Raw balance transaction fee details contain an invalid amount or currency.",
        details,
      );
      requireQa(
        transaction.status !== "available" ||
          transaction.fee_details.reduce(
            (sum, fee) => sum + BigInt(fee.amount),
            0n,
          ) === BigInt(transaction.fee),
        "Available balance transaction fee details do not sum to its fee.",
        details,
      );
    }
    const providerStatus =
      transaction?.status === "available"
        ? "confirmed"
        : transaction?.status === "pending"
          ? "pending"
          : "unavailable";
    if (providerStatus !== "confirmed") issue(key, `cost_${providerStatus}`);
    if (persisted && transaction) {
      requireQa(
        persisted.key ===
          `stripe:test:${persisted.account_id}:balance_transaction:${persisted.balance_transaction_id}` &&
          persisted.mode === "test" &&
          persisted.currency_code === "usd" &&
          persisted.balance_transaction_id === transaction.id &&
          (persisted.source_id === null || persisted.source_id === source) &&
          (persisted.amount_minor === null ||
            persisted.amount_minor === transaction.amount),
        "Persisted cost identity or signed amount differs from the actual Stripe transaction.",
      );
      if (persisted.status !== providerStatus)
        issue(key, "persisted_cost_status_stale");
      if (persisted.status === "confirmed") {
        requireQa(
          transaction.status === "available" &&
            persisted.fee_minor === transaction.fee &&
            persisted.net_minor === transaction.net &&
            isDeepStrictEqual(
              persisted.fee_details,
              transaction.fee_details.map((fee) => ({
                amount_minor: fee.amount,
                currency_code: fee.currency,
                type: fee.type,
                description: fee.description,
                application: fee.application,
              })),
            ),
          "Confirmed persisted fees differ from actual Stripe fee details.",
        );
      }
    }
    return {
      key,
      provider_status: providerStatus,
      persisted_status: persisted?.status ?? "missing",
      fee_minor:
        providerStatus === "confirmed" && persisted?.status === "confirmed"
          ? persisted.fee_minor
          : null,
    };
  });
  const uniqueIssues = [
    ...new Map(
      issues.map((entry) => [`${entry.resource}:${entry.reason}`, entry]),
    ).values(),
  ];
  return {
    status: uniqueIssues.length ? "needs_reconciliation" : "verified",
    costs: rows,
    confirmed_fee_minor: rows
      .reduce((sum, row) => sum + BigInt(row.fee_minor ?? 0), 0n)
      .toString(),
    issues: uniqueIssues,
  };
}

async function inspectCosts(
  container: MedusaContainer,
  manifest: Manifest,
  groups: Inspection[],
  progress: (stage: CostStage, groupIndex?: number) => void,
) {
  progress("provider_account");
  const stripe = financeStripeClient();
  const platform = await stripe.accounts.retrieveCurrent();
  const comparisons: Array<
    { group_id: string } & ReturnType<typeof contrastNativeProviderCosts>
  > = [];
  const evidence: Array<{
    group_id: string;
    observed: ProviderFactsObservation;
    stored: FinanceReportingSources;
    transactions: Stripe.BalanceTransaction[];
  }> = [];
  for (const [groupIndex, group] of groups.entries()) {
    progress("capture_reference", groupIndex);
    const chargeId = objectId(group.provider.intent.latest_charge);
    requireQa(
      chargeId && group.provider.intent.status === "succeeded",
      "Cost contrast requires each authorized checkout's actual capture.",
    );
    const transactions = new Map<string, Stripe.BalanceTransaction>();
    let observedCharge: Stripe.Charge | undefined;
    const observedRefunds: Stripe.Refund[] = [];
    const releaseIds = group.target.finalCapture?.released_refund_ids ?? [];
    progress("provider_observation", groupIndex);
    const observed = await observeStripeFinanceFacts(
      {
        accounts: stripe.accounts,
        balance: stripe.balance,
        charges: {
          retrieve: async (id: string) => {
            const charge = await stripe.charges.retrieve(id);
            observedCharge = charge;
            return charge;
          },
        },
        refunds: {
          list: (params?, options?) => {
            const request = stripe.refunds.list(params, options);
            void request.then(
              (page) => {
                observedRefunds.push(...page.data);
              },
              () => undefined,
            );
            return request;
          },
        },
        transfers: stripe.transfers,
        events: stripe.events,
        balanceTransactions: {
          retrieve: async (id: string) => {
            const transaction = await stripe.balanceTransactions.retrieve(id);
            transactions.set(id, transaction);
            return transaction;
          },
        },
      },
      {
        account_id: platform.id,
        group_id: group.group.id,
        charge_id: chargeId,
        orders: group.currents.map((current) => ({
          order_id: current.original!.order_id,
          seller_id: current.original!.seller_id,
          destination_account_id: current.payout?.account.data.id ?? null,
        })),
        authorization_release_refund_ids: releaseIds,
        recorded_at: new Date().toISOString(),
      },
    );
    progress("observed_scope", groupIndex);
    requireQa(
      observed.facts.some(
        (fact) =>
          fact.kind === "capture" &&
          fact.provider_id === chargeId &&
          fact.amount_minor === group.provider.intent.amount_received,
      ) &&
        observed.facts.every(
          (fact) =>
            fact.account_id === platform.id &&
            fact.group_id === group.group.id &&
            fact.payment_intent_id === group.provider.intent.id &&
            fact.charge_id === chargeId &&
            fact.mode === "test",
        ),
      "Observed cost facts escaped the exact checkout/account scope.",
    );
    progress("persisted_reporting", groupIndex);
    const stored = await readOrderFinanceReportingSources(container, {
      order_id: group.target.original!.order_id,
      actor_id: manifest.admin.user_id,
    });
    progress("cost_comparison", groupIndex);
    comparisons.push({
      group_id: group.group.id,
      ...contrastNativeProviderCosts(
        observed,
        stored,
        [...transactions.values()],
        observedCharge
          ? {
              charge: observedCharge,
              refunds: observedRefunds,
              authorization_release_refund_ids: releaseIds,
            }
          : undefined,
      ),
    });
    evidence.push({
      group_id: group.group.id,
      observed,
      stored,
      transactions: [...transactions.values()],
    });
  }
  const costs = new Map<
    string,
    (typeof comparisons)[number]["costs"][number]
  >();
  progress("shared_cost_consistency");
  for (const comparison of comparisons)
    for (const cost of comparison.costs) {
      const previous = costs.get(cost.key);
      requireQa(
        !previous || isDeepStrictEqual(previous, cost),
        "A shared provider cost changed between group reads.",
      );
      costs.set(cost.key, cost);
    }
  return {
    evidence,
    status: comparisons.every((part) => part.status === "verified")
      ? "verified"
      : "needs_reconciliation",
    groups: comparisons,
    unique_cost_count: costs.size,
    confirmed_fee_minor: [...costs.values()]
      .reduce((sum, row) => sum + BigInt(row.fee_minor ?? 0), 0n)
      .toString(),
  };
}

/**
 * PREPARED ONLY. Args: inspect|rate|costs [--execute]; only rate may execute.
 * FINANCE_NATIVE_QA_RATE_ORDER_IDS: normal A,B, then partial A,B (four distinct IDs).
 * Both snapshots must already exist; partial cancellation/capture may follow the rate change.
 * FINANCE_NATIVE_QA_RATE_COST_OUTPUT_PATH: new private file for rate execution or costs evidence.
 * Uses the initial runner's environment and manifest guards. Costs never writes to DB/Stripe.
 */
export default async function verifyNativeFinanceRateCosts({
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
  requireQa(
    args.slice(1).every((argument) => argument === "--execute") &&
      args.filter((argument) => argument === "--execute").length <= 1 &&
      (!execute || phase === "rate"),
    "Only the rate phase accepts one explicit --execute argument.",
  );
  const ids = z
    .array(z.string().startsWith("order_"))
    .length(4)
    .parse(process.env.FINANCE_NATIVE_QA_RATE_ORDER_IDS?.split(","));
  requireQa(
    new Set(ids).size === 4,
    "Four unique explicit order IDs are required.",
  );
  const workspace = await realpath(path.resolve(__dirname, "../../../.."));
  const manifestPath = await nativeFinancePrivatePath(
    process.env.NATIVE_CHECKOUT_MANIFEST_PATH,
    workspace,
    true,
  );
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const before = await rateEvidence(container, manifest, ids);
  assertNativeQaRate(
    manifest,
    before.rate,
    before.originals,
    phase === "rate"
      ? 10
      : z.union([z.literal(10), z.literal(12)]).parse(before.rate.value),
  );
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (phase === "inspect" || (phase === "rate" && !execute)) {
    logger.info(
      JSON.stringify({
        phase,
        order_ids: ids,
        rate_id: before.rate.id,
        current_rate: before.rate.value,
        proposed_rate: phase === "rate" ? 12 : undefined,
        native_commission_rows: before.lines.length,
        status: "inspected",
      }),
    );
    return;
  }
  const outputPath = await nativeFinancePrivatePath(
    process.env.FINANCE_NATIVE_QA_RATE_COST_OUTPUT_PATH,
    workspace,
    false,
  );
  const output = await open(outputPath, "wx", 0o600);
  const update = { input: [{ id: manifest.commission_rate_id, value: 12 }] };
  const refresh = { input: { order_ids: ids } };
  const baseline = structuredClone(rateInvariant(before));
  const checkpoint = async (status: string, observation?: unknown) => {
    await output.appendFile(
      `${JSON.stringify({
        version: 1,
        run_id: manifest.run_id,
        phase,
        order_ids: ids,
        status,
        ...(phase === "rate" ? { update, refresh } : {}),
        observation,
      })}\n`,
    );
    await output.sync();
  };
  let costProgress: {
    stage: CostStage | "final_evidence" | "checkpoint";
    group_index?: number;
  } = {
    stage: "checkpoint",
  };
  try {
    if (phase === "costs") {
      await checkpoint("inspection_started");
      const { evidence, ...comparison } = await inspectCosts(
        container,
        manifest,
        before.groups,
        (stage, groupIndex) => {
          costProgress = {
            stage,
            ...(groupIndex === undefined ? {} : { group_index: groupIndex }),
          };
        },
      );
      costProgress = { stage: "final_evidence" };
      const after = await rateEvidence(container, manifest, ids);
      requireQa(
        isDeepStrictEqual(rateInvariant(after), baseline),
        "Financial evidence changed during read-only cost contrast.",
      );
      costProgress = { stage: "checkpoint" };
      await checkpoint(comparison.status, { ...comparison, evidence });
      logger.info(
        JSON.stringify({ phase, ...comparison, checkpoint: outputPath }),
      );
      return;
    }
    await executeNativeRateChange({
      before,
      update: () => updateCommissionRatesWorkflow(container).run(update),
      refresh: () =>
        refreshOrderCommissionLinesWorkflow(container).run(refresh),
      inspect: () => rateEvidence(container, manifest, ids),
      verify: (observation) => {
        assertNativeQaRate(
          manifest,
          observation.rate,
          observation.originals,
          12,
        );
        requireQa(
          isDeepStrictEqual(rateInvariant(observation), baseline),
          "A future rate change/refresh changed original sales, native commission rows or financial effects.",
        );
      },
      checkpoint: (status, observation) =>
        checkpoint(
          status,
          observation
            ? {
                rate: observation.rate,
                ...rateInvariant(observation),
              }
            : undefined,
        ),
    });
    logger.info(
      JSON.stringify({
        phase,
        status: "verified",
        from: 10,
        to: 12,
        checkpoint: outputPath,
      }),
    );
  } catch (error) {
    const failure = nativeFinanceQaFailure(error);
    await checkpoint(phase === "rate" ? "uncertain" : "inspection_failed", {
      failure,
      ...(phase === "costs" ? costProgress : {}),
    }).catch(() => undefined);
    throw new Error(
      phase === "rate"
        ? "Rate QA stopped; inspect its private checkpoint and current rule. No automatic rollback or retry was attempted."
        : `Cost contrast failed at ${costProgress.stage}${costProgress.group_index === undefined ? "" : ` (group ${costProgress.group_index})`}: ${failure.kind === "qa_guard" ? failure.reason : "external or unclassified failure"} Inspect its private checkpoint. No financial mutation was attempted.`,
    );
  } finally {
    await output.close();
  }
}
