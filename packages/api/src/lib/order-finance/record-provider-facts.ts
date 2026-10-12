import { isDeepStrictEqual } from "node:util";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type Stripe from "stripe";
import { parseISO } from "date-fns/parseISO";
import { FINAL_CAPTURE_OPERATION_METADATA } from "../../modules/stripe-allocated-payment/service";
import { financeAmount, financeOperationSchema } from "./policy";
import { financeStripeClient } from "./provider";
import {
  observeStripeFinanceFacts,
  providerFinanceFactSchema,
  providerFinanceCostSchema,
  providerFinanceObservationMetadataSchema,
  providerFinanceObservationSchema,
  type ProviderFinanceObservationMetadata,
  type ProviderFinanceFact,
  type ProviderFactsObservation,
  type StripeFinanceReader,
} from "./provider-facts";
import { readOrderFinance } from "./read";
import { proportionalSettlement, settlementReduction } from "./settlement";
import {
  requireFinanceOperator,
  settlementPlanSchema,
} from "./settlement-plan";
import { assertOriginalGroup, originalSaleSchema } from "./snapshot";
import {
  financeCaptureAllocationSchema,
  financeRefundAdjustmentSchema,
  type FinanceCaptureAllocation,
  type FinanceRefundAdjustment,
  type FinanceReportingSources,
} from "./reporting-sources";
export {
  financeCaptureAllocationSchema,
  financeRefundAdjustmentSchema,
  sellerReportingSourcesSchema,
  type FinanceCaptureAllocation,
  type FinanceRefundAdjustment,
  type FinanceReportingSources,
} from "./reporting-sources";

type CurrentFinance = Awaited<ReturnType<typeof readOrderFinance>>;
type FinanceReader = StripeFinanceReader & {
  paymentIntents: Pick<Stripe["paymentIntents"], "retrieve">;
};
const dataKindSchema = z.enum(["ordinary", "qa_fixture", "unknown"]);
const payoutEvidenceSchema = z.object({
  action: z.literal("payout"),
  order_id: z.string(),
  plan: settlementPlanSchema,
  payout_id: z.string().optional(),
  transfer_id: z.string().optional(),
});
const minorAmount = (amount: Parameters<typeof financeAmount>[0]) =>
  MathBN.mult(financeAmount(amount), 100).toNumber();
const objectId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : (value?.id ?? null);

function captureAllocationTiming(
  amount: number | null,
  fact?: ProviderFinanceFact,
): Pick<
  FinanceCaptureAllocation,
  | "effective_at"
  | "effective_source"
  | "effective_time_status"
  | "recorded_at"
  | "reconciled_at"
> {
  const ownCapture =
    amount !== null &&
    amount > 0 &&
    fact?.kind === "capture" &&
    fact.effect_status === "confirmed" &&
    fact.reconciliation_status === "matched";
  const verified =
    ownCapture &&
    fact.effective_source === "stripe_event_created" &&
    fact.effective_at !== null &&
    fact.provider_event_id !== null;
  return {
    effective_at: verified ? fact.effective_at : null,
    effective_source: verified ? "stripe_event_created" : "unknown",
    effective_time_status:
      amount === 0 ? "not_applicable" : verified ? "verified" : "unknown",
    // Audit dates never substitute for the capture event's effective date.
    recorded_at: ownCapture ? fact.recorded_at : null,
    reconciled_at: verified ? fact.reconciled_at : null,
  };
}

/** Called from an authorized finance workflow, including its uncertain path. */
export async function recordOrderFinanceProviderFacts(
  container: MedusaContainer,
  input: {
    order_id: string;
    actor_id: string;
    owned_token?: string;
    recorded_at?: string;
  },
  stripe: FinanceReader = financeStripeClient(),
): Promise<FinanceReportingSources> {
  const current = await readOrderFinance(
    container,
    input.order_id,
    { actor_id: input.actor_id },
    input.owned_token,
  );
  const views = await Promise.all(
    current.group.orders.map((order) =>
      order.id === input.order_id
        ? current
        : readOrderFinance(
            container,
            order.id,
            { actor_id: input.actor_id },
            input.owned_token,
          ),
    ),
  );
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  if (
    !payment ||
    current.group.orders.some((order) => {
      const payments = order.cart.payment_collection.payments;
      return (
        payments.length !== 1 ||
        payments[0].id !== payment.id ||
        payments[0].data.id !== payment.data.id
      );
    })
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A provider observation requires one shared native payment.",
    );
  const [intent, account] = await Promise.all([
    stripe.paymentIntents.retrieve(payment.data.id),
    stripe.accounts.retrieveCurrent(),
  ]);
  if (
    intent.id !== payment.data.id ||
    intent.livemode ||
    intent.currency !== "usd" ||
    intent.amount !== minorAmount(payment.amount)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The provider payment differs from the native allocation.",
    );
  const chargeId = objectId(intent.latest_charge);
  const recordedAt = input.recorded_at ?? new Date().toISOString();
  z.iso.datetime({ offset: true }).parse(recordedAt);
  const payouts = current.operations.flatMap((operation) => {
    const parsed = payoutEvidenceSchema.safeParse(operation.result);
    return operation.kind === "payout" &&
      parsed.success &&
      parsed.data.plan.group_id === current.group.id &&
      parsed.data.plan.payment_id === payment.id &&
      parsed.data.plan.payment_intent_id === intent.id &&
      parsed.data.plan.platform_account_id === account.id &&
      parsed.data.plan.order_id === parsed.data.order_id
      ? [{ operation, result: parsed.data }]
      : [];
  });
  const orders = current.group.orders.map((order, index) => {
    const destinations = new Set(
      [
        views[index].payout?.data.destination,
        ...payouts
          .filter(
            (row) =>
              row.result.order_id === order.id &&
              row.result.plan.seller_id === order.seller.id,
          )
          .map((row) => row.result.plan.destination),
        ...current.operations.flatMap((operation) => {
          const parsed = financeOperationSchema.safeParse(operation.result);
          return parsed.success && parsed.data.order_id === order.id
            ? [parsed.data.settlement?.destination]
            : [];
        }),
      ].filter((value): value is string => Boolean(value)),
    );
    return {
      order_id: order.id,
      seller_id: order.seller.id,
      destination_account_id:
        destinations.size === 1 ? [...destinations][0] : null,
    };
  });
  const observation: ProviderFactsObservation = chargeId
    ? await observeStripeFinanceFacts(stripe, {
        account_id: account.id,
        group_id: current.group.id,
        charge_id: chargeId,
        orders,
        authorization_release_refund_ids:
          current.finalCapture?.released_refund_ids ?? [],
        recorded_at: recordedAt,
      })
    : {
        facts: [],
        costs: [],
        coverage: {
          complete: false,
          issues: [{ resource: intent.id, reason: "charge_missing" }],
          lists: [],
          capture_events_scope: "stripe_retained_events_30_days",
        },
      };
  if (observation.facts.some((fact) => fact.payment_intent_id !== intent.id))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The observed charge belongs to another payment.",
    );
  const sources = reconcileFinanceReportingSources(
    current,
    views,
    providerFinanceObservationMetadataSchema.parse({
      group_id: current.group.id,
      observed_at: recordedAt,
      reporting_context: {
        payment_intent_id: intent.id,
        amount_received_minor: intent.amount_received,
        status: intent.status,
        finance_data_kind:
          dataKindSchema.safeParse(intent.metadata.finance_data_kind).data ??
          "unknown",
        capture_operation_id:
          intent.metadata[FINAL_CAPTURE_OPERATION_METADATA] || null,
        charge_id: chargeId,
        operation_revisions: current.operations.map((operation) => ({
          operation_id: operation.id,
          updated_at: (
            operation.updated_at ?? operation.created_at
          ).toISOString(),
          state: operation.state,
        })),
      },
    }),
    observation,
    payouts,
  );
  const saved = await current.journal.recordProviderObservation(sources);
  saved.coverage.issues = saved.coverage.issues.filter(
    (entry) =>
      !["capture_time_unverified", "refund_time_unverified"].includes(
        entry.reason,
      ) ||
      !saved.facts.some(
        (fact) =>
          fact.provider_id === entry.resource &&
          fact.effective_source === "stripe_event_created",
      ),
  );
  saved.coverage.complete = saved.coverage.issues.length === 0;
  return {
    ...sources,
    ...saved,
    capture_allocations: sources.capture_allocations.map((allocation) => ({
      ...allocation,
      ...captureAllocationTiming(
        allocation.captured_amount,
        saved.facts.find((fact) => fact.key === allocation.capture_fact_key),
      ),
    })),
  };
}

/** Read-only reporting: no provider requests and no journal writes. */
export async function readOrderFinanceReportingSources(
  container: MedusaContainer,
  input: { order_id: string; actor_id: string; seller_id?: string },
): Promise<FinanceReportingSources> {
  return readFinanceReportingGroupSources(container, input, true);
}

/** Internal projection worker read: authorize one native order before reading its shared group.
 * Shared evidence stays in the worker and must be redacted separately before persistence. */
export async function readSellerGroupFinanceReportingSources(
  container: MedusaContainer,
  input: { order_id: string; actor_id: string; seller_id: string },
): Promise<FinanceReportingSources> {
  if (!input.seller_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Select a seller for this reporting group.",
    );
  return readFinanceReportingGroupSources(container, input, false);
}

async function readFinanceReportingGroupSources(
  container: MedusaContainer,
  input: { order_id: string; actor_id: string; seller_id?: string },
  redact: boolean,
): Promise<FinanceReportingSources> {
  if (input.seller_id === undefined)
    await requireFinanceOperator(container, input.actor_id);
  const current = await readOrderFinance(container, input.order_id, input);
  const currentRevision = reportingReadRevision(current);
  const initialReads = await Promise.all(
    current.group.orders.map(async (order) => {
      const view =
        order.id === input.order_id
          ? current
          : await readOrderFinance(container, order.id, {
              actor_id: input.actor_id,
            });
      return {
        order_id: order.id,
        view,
        revision:
          order.id === input.order_id
            ? currentRevision
            : reportingReadRevision(view),
      };
    }),
  );
  const views = initialReads.map((read) => read.view);
  const storedFacts = await current.journal.listFinanceProviderFacts(
    { group_id: current.group.id },
    { take: 10001 },
  );
  const issues: ProviderFactsObservation["coverage"]["issues"] = [];
  if (storedFacts.length > 10000)
    issues.push({ resource: current.group.id, reason: "stored_facts_limit" });
  const facts = storedFacts.slice(0, 10000).flatMap((record) => {
    const parsed = providerFinanceFactSchema.safeParse(record.fact);
    if (!parsed.success || parsed.data.group_id !== current.group.id) {
      issues.push({ resource: record.id, reason: "stored_fact_invalid" });
      return [];
    }
    const fact = parsed.data;
    if (
      ["refund", "authorization_release"].includes(fact.kind) &&
      fact.effective_source === "stripe_object_created"
    ) {
      fact.effective_at = null;
      fact.effective_source = "unknown";
      fact.provider_event_id = null;
      fact.reconciled_at = null;
      issues.push({
        resource: fact.provider_id,
        reason: "refund_time_unverified",
      });
    }
    return [fact];
  });
  const costKeys = [
    ...new Set(
      facts
        .filter((fact) => fact.balance_transaction_id)
        .map(
          (fact) =>
            `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`,
        ),
    ),
  ];
  const storedCosts = costKeys.length
    ? await current.journal.listFinanceProviderCosts(
        { id: costKeys },
        { take: 10001 },
      )
    : [];
  const costs = storedCosts.flatMap((record) => {
    const parsed = providerFinanceCostSchema.safeParse(record.cost);
    if (!parsed.success || !costKeys.includes(parsed.data.key)) {
      issues.push({ resource: record.id, reason: "stored_cost_invalid" });
      return [];
    }
    return [parsed.data];
  });
  for (const key of costKeys)
    if (!costs.some((cost) => cost.key === key))
      issues.push({ resource: key, reason: "stored_cost_missing" });
  const stored = providerFinanceObservationSchema.safeParse(
    current.state?.observation?.finance_provider_observation,
  );
  let sources: FinanceReportingSources;
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  if (
    !stored.success ||
    stored.data.group_id !== current.group.id ||
    stored.data.reporting_context.payment_intent_id !== payment.data.id
  ) {
    issues.push({
      resource: current.group.id,
      reason: "provider_observation_missing",
    });
    sources = {
      facts,
      costs,
      coverage: {
        complete: false,
        issues,
        lists: [],
        capture_events_scope: "stripe_retained_events_30_days",
      },
      capture_allocations: current.group.orders.map((order) =>
        financeCaptureAllocationSchema.parse({
          group_id: current.group.id,
          order_id: order.id,
          seller_id: order.seller.id,
          capture_fact_key: null,
          status: "unverified",
          ...captureAllocationTiming(null),
          currency_code: "usd",
          data_kind: "unknown",
          original: null,
          captured_amount: null,
          merchandise_collected: null,
          commission_recognized: null,
          seller_entitlement_recognized: null,
          component_attribution: "unknown",
        }),
      ),
      refund_adjustments: [],
    };
  } else {
    const metadata = providerFinanceObservationMetadataSchema.parse(
      stored.data,
    );
    const observation: ProviderFactsObservation = {
      facts,
      costs,
      observation: metadata,
      coverage: {
        ...stored.data.coverage,
        issues: [...stored.data.coverage.issues, ...issues],
      },
    };
    const observedAt = parseISO(metadata.observed_at).getTime();
    if (
      current.operations.some(
        (operation) =>
          !operation.updated_at || operation.updated_at.getTime() > observedAt,
      )
    )
      observation.coverage.issues.push({
        resource: current.group.id,
        reason: "provider_observation_stale",
      });
    const revisions = metadata.reporting_context.operation_revisions ?? [];
    for (const fact of facts)
      if (
        fact.reconciliation_status === "matched" &&
        fact.operation_id !== null &&
        !revisions.some(
          (revision) => revision.operation_id === fact.operation_id,
        )
      )
        observation.coverage.issues.push({
          resource: fact.key,
          reason: "provider_fact_operation_unobserved",
        });
    if (
      revisions.length !== current.operations.length ||
      current.operations.some(
        (operation) =>
          !revisions.some(
            (revision) =>
              revision.operation_id === operation.id &&
              revision.state === operation.state &&
              revision.updated_at === operation.updated_at?.toISOString(),
          ),
      )
    )
      observation.coverage.issues.push({
        resource: current.group.id,
        reason: "provider_context_revision_stale",
      });
    if (
      facts.some(
        (fact) =>
          fact.payment_intent_id !==
            metadata.reporting_context.payment_intent_id ||
          fact.charge_id !== metadata.reporting_context.charge_id,
      )
    )
      observation.coverage.issues.push({
        resource: current.group.id,
        reason: "provider_context_conflict",
      });
    const payouts = current.operations.flatMap((operation) => {
      const parsed = payoutEvidenceSchema.safeParse(operation.result);
      return operation.kind === "payout" &&
        parsed.success &&
        parsed.data.plan.group_id === current.group.id &&
        parsed.data.plan.payment_id === payment.id &&
        parsed.data.plan.payment_intent_id === payment.data.id
        ? [{ operation, result: parsed.data }]
        : [];
    });
    sources = reconcileFinanceReportingSources(
      current,
      views,
      metadata,
      observation,
      payouts,
    );
    sources.coverage.issues = sources.coverage.issues.filter(
      (entry) =>
        !["capture_time_unverified", "refund_time_unverified"].includes(
          entry.reason,
        ) ||
        !sources.facts.some(
          (fact) =>
            fact.provider_id === entry.resource &&
            fact.effective_source === "stripe_event_created",
        ),
    );
    sources.coverage.complete = sources.coverage.issues.length === 0;
  }
  const finalReads = await Promise.all(
    initialReads.map(async (initial) => {
      const latest = await readOrderFinance(
        container,
        initial.order_id,
        initial.order_id === input.order_id
          ? input
          : { actor_id: input.actor_id },
      );
      return isDeepStrictEqual(initial.revision, reportingReadRevision(latest));
    }),
  );
  if (finalReads.some((unchanged) => !unchanged)) {
    sources.coverage.complete = false;
    sources.coverage.issues.push({
      resource: current.group.id,
      reason: "reporting_read_changed",
    });
  }
  if (redact && input.seller_id !== undefined) {
    return sellerFinanceReportingSources(sources, input.order_id);
  }
  return sources;
}

/** Redact shared evidence while retaining the distinction between costs and seller principal. */
export function sellerFinanceReportingSources(
  sources: FinanceReportingSources,
  orderId: string,
): FinanceReportingSources {
  const costOnlyIncomplete =
    sources.coverage.issues.length > 0 &&
    sources.coverage.issues.every((entry) => /cost|fee/i.test(entry.reason));
  // Shared capture amounts, platform costs, and other sellers' evidence are private.
  return {
    facts: sources.facts.filter((fact) => fact.order_id === orderId),
    costs: [],
    capture_allocations: sources.capture_allocations.filter(
      (part) => part.order_id === orderId,
    ),
    refund_adjustments: sources.refund_adjustments.filter(
      (part) => part.order_id === orderId,
    ),
    coverage: {
      complete: sources.coverage.complete,
      issues: sources.coverage.complete
        ? []
        : [
            {
              resource: orderId,
              reason: costOnlyIncomplete
                ? "platform_cost_incomplete"
                : "group_reporting_incomplete",
            },
          ],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
}

function reportingReadRevision(current: CurrentFinance) {
  // Detach the evidence before any later reads can observe a concurrent writer.
  return structuredClone({
    group: current.group,
    state: current.state,
    operations: current.operations,
    originals: current.originals,
    final_capture: current.finalCapture,
    payout: current.payout,
  });
}

function reconcileFinanceReportingSources(
  current: CurrentFinance,
  views: CurrentFinance[],
  metadata: ProviderFinanceObservationMetadata,
  observation: ProviderFactsObservation,
  payouts: Array<{
    operation: CurrentFinance["operations"][number];
    result: z.infer<typeof payoutEvidenceSchema>;
  }>,
): FinanceReportingSources {
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  const context = metadata.reporting_context;
  const dataKind = context.finance_data_kind;
  observation.observation = metadata;
  observation.coverage.issues = observation.coverage.issues.filter(
    (entry) =>
      !["operation_open", "group_reconciliation_open"].includes(entry.reason),
  );
  const operations = current.operations.flatMap((operation) => {
    const parsed = financeOperationSchema.safeParse(operation.result);
    return parsed.success && operation.kind === parsed.data.action
      ? [{ operation, result: parsed.data }]
      : [];
  });
  const issue = (resource: string, reason: string) => {
    observation.coverage.complete = false;
    observation.coverage.issues.push({ resource, reason });
  };
  for (const operation of current.operations)
    if (operation.state !== "complete") issue(operation.id, "operation_open");
  if (operations.length + payouts.length !== current.operations.length)
    issue(current.group.id, "operation_evidence_unverified");
  if (current.state?.active_token || current.state?.review_required)
    issue(current.group.id, "group_reconciliation_open");
  let originalsValid = true;
  try {
    current.originals.forEach((sale) => originalSaleSchema.parse(sale));
    assertOriginalGroup(current.originals, current.group);
    if (
      current.originals.some(
        (sale) =>
          sale.allocation.payment_session_id !== payment.payment_session_id,
      )
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Different original session.",
      );
  } catch {
    originalsValid = false;
    issue(current.group.id, "originals_unverified");
  }
  const captureOperations = operations.filter(
    (row) => row.result.action === "capture",
  );
  const captureOperation =
    captureOperations.length === 1 ? captureOperations[0] : undefined;
  const capturePlan =
    current.finalCapture?.orders ?? captureOperation?.result.capture_orders;
  const captured = observation.facts.find((fact) => fact.kind === "capture");
  const nativeCapture =
    payment.captures.length === 1 &&
    captured &&
    minorAmount(payment.captures[0].amount) === captured.amount_minor
      ? payment.captures[0]
      : null;
  const verifiedCapturePlan =
    originalsValid &&
    captured &&
    captured.effect_status === "confirmed" &&
    captured.reconciliation_status !== "conflict" &&
    captured.amount_minor === context.amount_received_minor &&
    (capturePlan
      ? capturePlan.length === current.originals.length &&
        new Set(capturePlan.map((part) => part.order_id)).size ===
          capturePlan.length &&
        capturePlan.every((part) => {
          const sale = current.originals.find(
            (row) => row.order_id === part.order_id,
          );
          return (
            sale &&
            (financeAmount(part.amount) === 0 ||
              financeAmount(part.amount) === sale.gross)
          );
        }) &&
        capturePlan.reduce((sum, part) => sum + minorAmount(part.amount), 0) ===
          captured.amount_minor &&
        (current.finalCapture
          ? nativeCapture?.id === current.finalCapture.capture_id
          : captureOperation?.operation.id === context.capture_operation_id)
      : Boolean(nativeCapture) &&
        current.originals.reduce(
          (sum, sale) => sum + minorAmount(sale.gross),
          0,
        ) === captured.amount_minor);
  const match = (
    fact: ProviderFinanceFact,
    evidence: {
      operation_id: string | null;
      order_id: string | null;
      seller_id: string | null;
      native_id: string | null;
    },
  ) => {
    Object.assign(fact, evidence, {
      reconciliation_status: "matched",
      data_kind: dataKind,
      reconciled_at:
        fact.effect_status === "confirmed" && fact.effective_at
          ? (fact.reconciled_at ?? metadata.observed_at)
          : null,
    });
    providerFinanceFactSchema.parse(fact);
  };
  for (const fact of observation.facts) {
    if (fact.reconciliation_status === "conflict") continue;
    if (fact.kind === "capture") {
      if (verifiedCapturePlan)
        match(fact, {
          operation_id: captureOperation?.operation.id ?? null,
          native_id: nativeCapture?.id ?? null,
          order_id: null,
          seller_id: null,
        });
      continue;
    }
    if (fact.kind === "authorization_release") {
      if (
        (current.finalCapture?.released_refund_ids.includes(fact.provider_id) &&
          verifiedCapturePlan) ||
        (context.status === "canceled" &&
          context.amount_received_minor === 0 &&
          payment.canceled_at &&
          current.group.orders.every((order) => order.status === "canceled"))
      )
        match(fact, {
          operation_id: captureOperation?.operation.id ?? null,
          native_id: null,
          order_id: null,
          seller_id: null,
        });
      continue;
    }
    const candidates = operations.filter(({ operation, result }) => {
      if (result.action === "capture") return false;
      const knownId =
        fact.kind === "refund"
          ? result.provider_refund_id
          : fact.kind === "reversal"
            ? result.settlement?.reversal_id
            : undefined;
      return (
        knownId === fact.provider_id ||
        (fact.provider_operation_id === operation.id &&
          fact.provider_order_id === result.order_id)
      );
    });
    if (fact.kind === "refund" || fact.kind === "reversal") {
      if (candidates.length !== 1) continue;
      const { operation, result } = candidates[0];
      const order = current.group.orders.find(
        (row) => row.id === result.order_id,
      );
      const amount =
        fact.kind === "refund"
          ? minorAmount(result.amount)
          : minorAmount(
              result.settlement?.seller_reversal_amount ??
                result.settlement?.seller_reversed ??
                0,
            );
      if (
        !order ||
        fact.amount_minor !== amount ||
        (fact.provider_operation_id &&
          fact.provider_operation_id !== operation.id) ||
        (fact.provider_order_id && fact.provider_order_id !== order.id) ||
        (fact.provider_seller_id &&
          fact.provider_seller_id !== order.seller.id) ||
        (fact.kind === "reversal" &&
          (fact.transfer_id !== result.settlement?.transfer_id ||
            fact.destination_account_id !== result.settlement?.destination))
      ) {
        issue(fact.key, "journal_effect_mismatch");
        continue;
      }
      const refunds = payment.refunds.filter(
        (refund) =>
          refund.metadata?.finance_operation_id === operation.id &&
          refund.metadata.order_id === order.id &&
          minorAmount(refund.amount) === amount,
      );
      match(fact, {
        operation_id: operation.id,
        order_id: order.id,
        seller_id: order.seller.id,
        native_id:
          fact.kind === "refund"
            ? refunds.length === 1
              ? refunds[0].id
              : null
            : (result.settlement?.payout_id ?? null),
      });
      if (fact.kind === "refund" && refunds.length !== 1)
        issue(fact.key, "native_refund_unverified");
      continue;
    }
    const matching = payouts.filter(
      ({ operation, result }) =>
        result.transfer_id === fact.provider_id ||
        (fact.provider_operation_id === operation.id &&
          fact.provider_order_id === result.order_id),
    );
    if (matching.length !== 1) continue;
    const { operation, result } = matching[0];
    const plan = result.plan;
    const order = current.group.orders.find((row) => row.id === plan.order_id);
    const original = originalsValid
      ? current.originals.find((sale) => sale.order_id === plan.order_id)
      : null;
    if (
      !order ||
      !original ||
      plan.original_gross !== original.gross ||
      plan.original_commission !== original.commission ||
      plan.original_seller_entitlement !== original.seller_entitlement ||
      order.seller.id !== plan.seller_id ||
      plan.source_transaction !== fact.charge_id ||
      plan.transfer_group !== fact.provider_transfer_group ||
      plan.destination !== fact.destination_account_id ||
      minorAmount(plan.amount) !== fact.amount_minor ||
      (fact.provider_operation_id &&
        fact.provider_operation_id !== operation.id) ||
      (fact.provider_order_id && fact.provider_order_id !== order.id) ||
      (fact.provider_seller_id && fact.provider_seller_id !== order.seller.id)
    ) {
      issue(fact.key, "journal_effect_mismatch");
      continue;
    }
    const payout = views.find(
      (view) => view.original?.order_id === order.id,
    )?.payout;
    const nativeId =
      payout?.data.id === fact.provider_id &&
      payout.account_id === plan.account_id &&
      minorAmount(payout.amount) === fact.amount_minor
        ? payout.id
        : null;
    match(fact, {
      operation_id: operation.id,
      order_id: order.id,
      seller_id: order.seller.id,
      native_id: nativeId,
    });
    if (!nativeId) issue(fact.key, "native_payout_unverified");
  }
  for (const fact of observation.facts) {
    if (
      !fact.operation_id ||
      !["refund", "transfer", "reversal"].includes(fact.kind)
    )
      continue;
    const duplicates = observation.facts.filter(
      (entry) =>
        entry.kind === fact.kind && entry.operation_id === fact.operation_id,
    );
    if (duplicates.length < 2) continue;
    for (const duplicate of duplicates) {
      issue(duplicate.key, "operation_effect_ambiguous");
      Object.assign(duplicate, {
        reconciliation_status: "conflict",
        operation_id: null,
        order_id: null,
        seller_id: null,
        native_id: null,
        data_kind: "unknown",
        reconciled_at: null,
      });
    }
  }
  for (const { operation, result } of operations) {
    const expectedKind = result.action === "capture" ? "capture" : "refund";
    if (
      financeAmount(result.amount) > 0 &&
      (operation.state === "complete" ||
        result.refund_attempted ||
        result.capture_attempted ||
        result.provider_refund_id) &&
      !observation.facts.some(
        (fact) =>
          fact.kind === expectedKind && fact.operation_id === operation.id,
      )
    )
      issue(operation.id, `${expectedKind}_effect_unverified`);
    if (
      (result.reversal_attempted || result.settlement?.reversal_id) &&
      !observation.facts.some(
        (fact) =>
          fact.kind === "reversal" && fact.operation_id === operation.id,
      )
    )
      issue(operation.id, "reversal_effect_unverified");
  }
  for (const { operation, result } of payouts)
    if (
      result.plan.outcome === "transfer_required" &&
      !observation.facts.some(
        (fact) =>
          fact.kind === "transfer" && fact.operation_id === operation.id,
      )
    )
      issue(operation.id, "transfer_effect_unverified");
  for (const view of views)
    if (
      view.payout &&
      !observation.facts.some(
        (fact) =>
          fact.kind === "transfer" && fact.provider_id === view.payout!.data.id,
      )
    )
      issue(view.payout.id, "native_transfer_not_observed");
  for (const refund of payment.refunds)
    if (
      !observation.facts.some(
        (fact) => fact.kind === "refund" && fact.native_id === refund.id,
      )
    )
      issue(refund.id, "native_refund_not_attributed");
  // Attribution coverage is recalculated after correlating verified journal evidence.
  observation.coverage.issues = observation.coverage.issues.filter((entry) => {
    const fact = observation.facts.find((row) => row.key === entry.resource);
    return (
      !fact ||
      (!(
        entry.reason === "unattributed" &&
        fact.reconciliation_status === "matched"
      ) &&
        !(entry.reason === "data_kind_unknown" && fact.data_kind !== "unknown"))
    );
  });
  const allocations = current.group.orders.map((order) => {
    const original = originalsValid
      ? current.originals.find((sale) => sale.order_id === order.id)!
      : null;
    const amount = verifiedCapturePlan
      ? financeAmount(
          capturePlan?.find((part) => part.order_id === order.id)?.amount ??
            original!.gross,
        )
      : context.amount_received_minor === 0 &&
          ["canceled", "requires_capture"].includes(context.status)
        ? 0
        : null;
    const known =
      original &&
      amount !== null &&
      (amount === 0 || amount === original.gross);
    if (!known) issue(order.id, "capture_allocation_unverified");
    const timing = captureAllocationTiming(amount, captured);
    if (
      known &&
      amount! > 0 &&
      timing.effective_time_status === "unknown" &&
      captured &&
      !observation.coverage.issues.some(
        (entry) =>
          entry.resource === captured.provider_id &&
          entry.reason === "capture_time_unverified",
      )
    )
      issue(captured.provider_id, "capture_time_unverified");
    return financeCaptureAllocationSchema.parse({
      group_id: current.group.id,
      order_id: order.id,
      seller_id: order.seller.id,
      capture_fact_key: captured?.key ?? null,
      status:
        amount === null
          ? "unverified"
          : amount === 0
            ? "not_captured"
            : "confirmed",
      ...timing,
      currency_code: "usd",
      data_kind: dataKind,
      original,
      captured_amount: amount,
      merchandise_collected: known
        ? amount === 0
          ? 0
          : MathBN.sub(
              original.components.merchandise_subtotal,
              original.components.merchandise_discount,
            ).toNumber()
        : null,
      commission_recognized: known
        ? amount === 0
          ? 0
          : original.commission
        : null,
      seller_entitlement_recognized: known
        ? amount === 0
          ? 0
          : original.seller_entitlement
        : null,
      component_attribution: known ? "original_snapshot" : "unknown",
    });
  });
  const adjustments: FinanceRefundAdjustment[] = [];
  for (const order of current.group.orders) {
    let refunded = 0;
    for (const { operation, result } of operations.filter(
      (row) => row.result.order_id === order.id,
    )) {
      const facts = observation.facts.filter(
        (fact) =>
          fact.kind === "refund" &&
          fact.operation_id === operation.id &&
          fact.reconciliation_status === "matched" &&
          fact.effect_status === "confirmed",
      );
      if (facts.length !== 1) continue;
      const original = originalsValid
        ? current.originals.find((sale) => sale.order_id === order.id)
        : null;
      try {
        const settlement = result.settlement;
        if (!original || !settlement)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Missing original adjustment.",
          );
        const amount = financeAmount(result.amount);
        const expected = proportionalSettlement(
          original.gross,
          original.seller_entitlement,
          refunded,
          amount,
        );
        if (
          financeAmount(settlement.gross) !== original.gross ||
          financeAmount(settlement.seller_net) !==
            original.seller_entitlement ||
          settlementReduction(settlement) !== expected.seller_reversed ||
          financeAmount(settlement.commission_returned) !==
            expected.commission_returned
        )
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Adjustment mismatch.",
          );
        adjustments.push(
          financeRefundAdjustmentSchema.parse({
            fact_key: facts[0].key,
            operation_id: operation.id,
            operation_state: operation.state,
            order_id: order.id,
            seller_id: order.seller.id,
            amount,
            seller_entitlement_reduced: expected.seller_reversed,
            commission_returned: expected.commission_returned,
            currency_code: "usd",
            component_attribution: "unallocated",
          }),
        );
        refunded = MathBN.add(refunded, amount).toNumber();
      } catch {
        issue(facts[0].key, "refund_adjustment_unverified");
        refunded = MathBN.add(refunded, result.amount).toNumber();
      }
    }
  }
  observation.coverage.complete = observation.coverage.issues.length === 0;
  return {
    ...observation,
    capture_allocations: allocations,
    refund_adjustments: adjustments,
  };
}
