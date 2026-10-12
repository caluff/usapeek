import type {
  FinanceReportingQuery,
  FinanceReportingResponse,
  FinanceReportingSale,
} from "./contracts";
import type {
  FinanceCaptureAllocation,
  FinanceRefundAdjustment,
  FinanceReportingSources,
} from "./record-provider-facts";
import type { FinanceReportingWindow } from "./reporting-period";
import type {
  ProviderFinanceCost,
  ProviderFinanceFact,
} from "./provider-facts";
import type { MedusaContainer, OrderDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { readOrderFinanceReportingSources } from "./record-provider-facts";
import { resolveFinanceReportingWindow } from "./reporting-period";

const GROUP_PAGE_SIZE = 100;
const MAX_REPORT_GROUPS = 2_000;
const SOURCE_CONCURRENCY = 4;

type ReportingGroupProjection = {
  id: string;
  orders?: Array<
    Partial<Pick<OrderDTO, "id" | "display_id" | "custom_display_id">> & {
      seller?: { id?: string | null } | null;
    }
  >;
};

async function readReportingGroups(container: MedusaContainer, signal?: AbortSignal) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const groups: ReportingGroupProjection[] = [];
  let sourceLimitReached = false;

  for (let skip = 0; skip <= MAX_REPORT_GROUPS; skip += GROUP_PAGE_SIZE) {
    signal?.throwIfAborted();
    const take = Math.min(GROUP_PAGE_SIZE, MAX_REPORT_GROUPS + 1 - skip);
    const { data } = await query.graph(
      {
        entity: "order_group",
        fields: [
          "id",
          "orders.id",
          "orders.display_id",
          "orders.custom_display_id",
          "orders.seller.id",
        ],
        pagination: { skip, take, order: { id: "ASC" } },
      },
      { cache: { enable: false } },
    );
    signal?.throwIfAborted();
    const page = data as unknown as ReportingGroupProjection[];
    groups.push(...page);
    if (groups.length > MAX_REPORT_GROUPS) {
      groups.length = MAX_REPORT_GROUPS;
      sourceLimitReached = true;
      break;
    }
    if (page.length < take) break;
  }
  return { groups, sourceLimitReached };
}

async function readSources(
  container: MedusaContainer,
  groupIds: string[],
  selectOrderId: (groupId: string) => string | undefined,
  actorId: string,
  sellerId?: string,
  signal?: AbortSignal,
) {
  const sources: FinanceReportingSources[] = [];
  const failures: FinanceReportingSources[] = [];
  let nextIndex = 0;
  const workers = await Promise.allSettled(
    Array.from({ length: sellerId === undefined ? 2 : SOURCE_CONCURRENCY }, async () => {
      while (nextIndex < groupIds.length) {
        signal?.throwIfAborted();
        const groupId = groupIds[nextIndex++];
        const orderId = selectOrderId(groupId);
        if (!orderId) continue;
        try {
          sources.push(
            await readOrderFinanceReportingSources(container, {
              order_id: orderId,
              actor_id: actorId,
              ...(sellerId === undefined ? {} : { seller_id: sellerId }),
            }),
          );
        } catch {
          signal?.throwIfAborted();
          failures.push({
            facts: [],
            costs: [],
            capture_allocations: [],
            refund_adjustments: [],
            coverage: {
              complete: false,
              issues: [
                { resource: groupId, reason: "reporting_source_unavailable" },
              ],
              lists: [],
              capture_events_scope: "stripe_retained_events_30_days",
            },
          });
        }
      }
    }),
  );
  // Keep an abandoned flight alive until every active source read has drained.
  signal?.throwIfAborted();
  const failure = workers.find((worker) => worker.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return [...sources, ...failures];
}

export async function readFinanceReporting(
  container: MedusaContainer,
  input: {
    actor_id: string;
    query: FinanceReportingQuery;
    seller_id?: string;
    generated_at?: Date;
    signal?: AbortSignal;
  },
): Promise<FinanceReportingResponse> {
  const { groups, sourceLimitReached } = await readReportingGroups(container, input.signal);
  const ownOrderByGroup = new Map<string, string>();
  const orderReferences = new Map<
    string,
    Pick<FinanceReportingSale, "order_display_id" | "order_custom_display_id">
  >();
  const relevantGroupIds: string[] = [];
  for (const group of groups) {
    const orders = group.orders ?? [];
    for (const order of orders) {
      if (
        order.id &&
        (input.seller_id === undefined || order.seller?.id === input.seller_id)
      ) {
        orderReferences.set(order.id, {
          order_display_id: order.display_id ?? null,
          order_custom_display_id: order.custom_display_id ?? null,
        });
      }
    }
    if (input.seller_id === undefined) {
      const orderId = orders.find((order) => order.id)?.id;
      if (orderId) relevantGroupIds.push(group.id);
      if (orderId) ownOrderByGroup.set(group.id, orderId);
    } else {
      const orderId = orders.find(
        (order) => order.id && order.seller?.id === input.seller_id,
      )?.id;
      if (orderId) {
        relevantGroupIds.push(group.id);
        ownOrderByGroup.set(group.id, orderId);
      }
    }
  }

  const sources = await readSources(
    container,
    relevantGroupIds,
    (groupId) => ownOrderByGroup.get(groupId),
    input.actor_id,
    input.seller_id,
    input.signal,
  );
  input.signal?.throwIfAborted();
  const window = resolveFinanceReportingWindow(
    input.query.period,
    input.generated_at ?? new Date(),
  );
  const result = aggregateFinanceReporting(input.query, window, sources, {
    sellerView: input.seller_id !== undefined,
    sourceLimitReached,
  });
  result.report.sales = result.report.sales.map((sale) => ({
    ...sale,
    ...orderReferences.get(sale.order_id),
  }));
  return result;
}

type SaleAccumulator = {
  order_id: string;
  capture_status: FinanceReportingSale["capture_status"];
  captured_at: string | null;
  captured_amount_cents: number | null;
  captured_period_cents: number;
  merchandise_cents: number | null;
  merchandise_period_cents: number;
  refunds_cents: number;
  gross_commission_cents: number | null;
  commission_period_cents: number;
  commission_reversed_cents: number;
  seller_earnings_cents: number | null;
  seller_earnings_period_cents: number;
  transfers_gross_cents: number;
  transfer_reversals_cents: number;
  transfers_net_cents: number;
  cumulative_transfers_gross_cents: number;
  cumulative_transfer_reversals_cents: number;
  cumulative_earnings_cents: number;
  cumulative_transfers_cents: number;
  coverage_complete: boolean;
};

const cents = (amount: number): number | null => {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const value = Math.round(amount * 100);
  return Number.isSafeInteger(value) && Math.abs(value / 100 - amount) < 1e-8
    ? value
    : null;
};

const money = (amount: number) => amount / 100;
const inRange = (instant: number, window: FinanceReportingWindow) =>
  instant >= Date.parse(window.start_at) && instant < Date.parse(window.end_at);

function movementTime(fact: ProviderFinanceFact): number | null {
  if (!fact.effective_at || fact.effective_source === "unknown") return null;
  const time = Date.parse(fact.effective_at);
  return Number.isFinite(time) ? time : null;
}

function allocationTime(allocation: FinanceCaptureAllocation): number | null {
  if (
    !allocation.effective_at ||
    allocation.effective_time_status !== "verified" ||
    allocation.effective_source !== "stripe_event_created"
  )
    return null;
  const time = Date.parse(allocation.effective_at);
  return Number.isFinite(time) ? time : null;
}

function saleFor(
  sales: Map<string, SaleAccumulator>,
  orderId: string,
): SaleAccumulator {
  const current = sales.get(orderId);
  if (current) return current;
  const sale: SaleAccumulator = {
    order_id: orderId,
    capture_status: "unknown",
    captured_at: null,
    captured_amount_cents: null,
    captured_period_cents: 0,
    merchandise_cents: null,
    merchandise_period_cents: 0,
    refunds_cents: 0,
    gross_commission_cents: null,
    commission_period_cents: 0,
    commission_reversed_cents: 0,
    seller_earnings_cents: null,
    seller_earnings_period_cents: 0,
    transfers_gross_cents: 0,
    transfer_reversals_cents: 0,
    transfers_net_cents: 0,
    cumulative_transfers_gross_cents: 0,
    cumulative_transfer_reversals_cents: 0,
    cumulative_earnings_cents: 0,
    cumulative_transfers_cents: 0,
    coverage_complete: true,
  };
  sales.set(orderId, sale);
  return sale;
}

export function aggregateFinanceReporting(
  query: FinanceReportingQuery,
  window: FinanceReportingWindow,
  sourceSets: FinanceReportingSources[],
  options: { sellerView?: boolean; sourceLimitReached?: boolean } = {},
): FinanceReportingResponse {
  let capturedPeriod = 0;
  let merchandisePeriod = 0;
  let paidOrders = 0;
  let refundsPeriod = 0;
  let commissionPeriod = 0;
  let commissionReversedPeriod = 0;
  let sellerEarningsPeriod = 0;
  let transfersGrossPeriod = 0;
  let transferReversalsPeriod = 0;
  let transfersPeriod = 0;
  let cumulativeEarnings = 0;
  let cumulativeTransfers = 0;
  let confirmedFeesPeriod = 0;
  let unknownDataKind = 0;
  let unknownEffectiveTime = 0;
  let pendingFees = 0;
  let coverageComplete = !options.sourceLimitReached;
  const reasons = new Map<string, number>();
  const sales = new Map<string, SaleAccumulator>();
  const seenFacts = new Set<string>();
  const seenAllocations = new Set<string>();
  const seenAdjustments = new Set<string>();
  const costs = new Map<string, ProviderFinanceCost>();
  const costKinds = new Map<string, Set<string>>();

  const issue = (reason: string, count = 1) => {
    coverageComplete = false;
    reasons.set(reason, (reasons.get(reason) ?? 0) + count);
  };
  if (options.sourceLimitReached) issue("sales_source_limit_reached");

  for (const source of sourceSets) {
    const selectedFacts = source.facts.filter(
      (fact) =>
        fact.data_kind === query.data_kind &&
        fact.mode === query.mode &&
        fact.currency_code === query.currency_code,
    );
    const unknownFacts = source.facts.filter(
      (fact) => fact.data_kind === "unknown",
    );
    const selectedAllocations = source.capture_allocations.filter(
      (allocation) => allocation.data_kind === query.data_kind,
    );
    const unknownAllocations = source.capture_allocations.filter(
      (allocation) => allocation.data_kind === "unknown",
    );
    const selectedCostKeys = new Set(
      selectedFacts.flatMap((fact) => {
        const instant = movementTime(fact);
        return fact.balance_transaction_id &&
          (instant === null || inRange(instant, window))
          ? [
              `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`,
            ]
          : [];
      }),
    );
    const sourceMatchesReport =
      selectedFacts.length > 0 ||
      selectedAllocations.length > 0 ||
      unknownFacts.length > 0 ||
      unknownAllocations.length > 0;
    const relevantIssues = source.coverage.issues.filter((entry) => {
      const costIssue = /cost|fee/i.test(entry.reason);
      if (
        ["reporting_source_unavailable", "stored_facts_limit"].includes(
          entry.reason,
        )
      )
        return true;
      if (costIssue && options.sellerView) return false;
      if (costIssue) return selectedCostKeys.has(entry.resource);
      return sourceMatchesReport;
    });
    if (
      !source.coverage.complete &&
      sourceMatchesReport &&
      source.coverage.issues.length === 0
    )
      issue("reporting_source_incomplete");
    for (const entry of relevantIssues) issue(entry.reason);
    if (relevantIssues.length > 0) {
      const affectedOrders = new Set([
        ...selectedFacts.flatMap((fact) =>
          fact.order_id ? [fact.order_id] : [],
        ),
        ...selectedAllocations.map((allocation) => allocation.order_id),
        ...unknownFacts.flatMap((fact) =>
          fact.order_id ? [fact.order_id] : [],
        ),
        ...unknownAllocations.map((allocation) => allocation.order_id),
      ]);
      for (const orderId of affectedOrders)
        saleFor(sales, orderId).coverage_complete = false;
    }

    for (const fact of source.facts) {
      if (fact.kind === "authorization_release") {
        // A release is not captured/refunded money, but its verified balance
        // transaction still contributes a platform cost at the provider time.
        if (
          !options.sellerView &&
          fact.data_kind === query.data_kind &&
          fact.mode === query.mode &&
          fact.currency_code === query.currency_code &&
          fact.effect_status === "confirmed" &&
          fact.reconciliation_status === "matched" &&
          fact.balance_transaction_id
        ) {
          const key = `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`;
          const kinds = costKinds.get(key) ?? new Set<string>();
          kinds.add(fact.data_kind);
          costKinds.set(key, kinds);
        }
        continue;
      }
      if (fact.data_kind === "unknown") {
        unknownDataKind++;
        issue("data_kind_unknown");
        continue;
      }
      if (fact.data_kind !== query.data_kind) continue;
      if (
        fact.currency_code !== query.currency_code ||
        fact.mode !== query.mode
      ) {
        issue("reporting_filter_mismatch");
        continue;
      }
      if (
        fact.effect_status !== "confirmed" ||
        fact.reconciliation_status !== "matched"
      ) {
        issue("provider_fact_unconfirmed");
        continue;
      }
      const instant = movementTime(fact);
      if (instant === null) {
        unknownEffectiveTime++;
        issue("effective_time_unknown");
        continue;
      }
      if (!options.sellerView && fact.balance_transaction_id) {
        const key = `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`;
        const kinds = costKinds.get(key) ?? new Set<string>();
        kinds.add(fact.data_kind);
        costKinds.set(key, kinds);
      } else if (!options.sellerView && inRange(instant, window)) {
        issue("provider_cost_reference_missing");
        pendingFees++;
      }

      if (seenFacts.has(fact.key)) continue;
      seenFacts.add(fact.key);
      if (
        fact.kind === "transfer" &&
        instant < Date.parse(window.cutoff_at) &&
        (!options.sellerView || fact.order_id)
      )
        cumulativeTransfers += fact.amount_minor;
      if (
        fact.kind === "reversal" &&
        instant < Date.parse(window.cutoff_at) &&
        (!options.sellerView || fact.order_id)
      )
        cumulativeTransfers -= fact.amount_minor;
      if (fact.order_id && instant < Date.parse(window.cutoff_at)) {
        const sale = saleFor(sales, fact.order_id);
        if (fact.kind === "transfer") {
          sale.cumulative_transfers_cents += fact.amount_minor;
          sale.cumulative_transfers_gross_cents += fact.amount_minor;
        }
        if (fact.kind === "reversal") {
          sale.cumulative_transfers_cents -= fact.amount_minor;
          sale.cumulative_transfer_reversals_cents += fact.amount_minor;
        }
      }
      if (!inRange(instant, window)) continue;
      if (fact.kind === "refund") refundsPeriod += fact.amount_minor;
      if (fact.kind === "transfer") {
        transfersGrossPeriod += fact.amount_minor;
        transfersPeriod += fact.amount_minor;
      }
      if (fact.kind === "reversal") {
        transferReversalsPeriod += fact.amount_minor;
        transfersPeriod -= fact.amount_minor;
      }
      if (fact.order_id) {
        const sale = saleFor(sales, fact.order_id);
        if (fact.kind === "transfer") {
          sale.transfers_gross_cents += fact.amount_minor;
          sale.transfers_net_cents += fact.amount_minor;
        }
        if (fact.kind === "reversal") {
          sale.transfer_reversals_cents += fact.amount_minor;
          sale.transfers_net_cents -= fact.amount_minor;
        }
      }
    }

    for (const allocation of source.capture_allocations) {
      if (allocation.data_kind === "unknown") {
        unknownDataKind++;
        issue("data_kind_unknown");
        continue;
      }
      if (allocation.data_kind !== query.data_kind) continue;
      const sale = saleFor(sales, allocation.order_id);
      const key = `${allocation.group_id}:${allocation.order_id}`;
      if (seenAllocations.has(key)) {
        issue("duplicate_capture_allocation");
        sale.coverage_complete = false;
        continue;
      }
      seenAllocations.add(key);
      if (allocation.status === "not_captured") {
        sale.capture_status = "not_captured";
        sale.captured_amount_cents = 0;
        sale.merchandise_cents = 0;
        sale.gross_commission_cents = 0;
        sale.seller_earnings_cents = 0;
        continue;
      }
      if (allocation.status !== "confirmed") {
        issue("capture_allocation_unverified");
        sale.coverage_complete = false;
        continue;
      }
      const instant = allocationTime(allocation);
      if (instant === null) {
        unknownEffectiveTime++;
        issue("capture_time_unknown");
        sale.coverage_complete = false;
        continue;
      }
      if (instant >= Date.parse(window.cutoff_at)) continue;
      const amount =
        allocation.captured_amount === null
          ? null
          : cents(allocation.captured_amount);
      const merchandise =
        allocation.merchandise_collected === null
          ? null
          : cents(allocation.merchandise_collected);
      const commission =
        allocation.commission_recognized === null
          ? null
          : cents(allocation.commission_recognized);
      const entitlement =
        allocation.seller_entitlement_recognized === null
          ? null
          : cents(allocation.seller_entitlement_recognized);
      if (
        amount === null ||
        merchandise === null ||
        commission === null ||
        entitlement === null
      ) {
        issue("capture_amount_unverified");
        sale.coverage_complete = false;
        continue;
      }
      sale.capture_status = "confirmed";
      sale.captured_at = allocation.effective_at;
      sale.captured_amount_cents = amount;
      sale.merchandise_cents = merchandise;
      sale.gross_commission_cents = commission;
      sale.seller_earnings_cents = entitlement;
      cumulativeEarnings += entitlement;
      sale.cumulative_earnings_cents += entitlement;
      if (!inRange(instant, window)) continue;
      capturedPeriod += amount;
      merchandisePeriod += merchandise;
      commissionPeriod += commission;
      sellerEarningsPeriod += entitlement;
      sale.captured_period_cents += amount;
      sale.merchandise_period_cents += merchandise;
      sale.commission_period_cents += commission;
      sale.seller_earnings_period_cents += entitlement;
      paidOrders++;
    }

    const factsByKey = new Map(source.facts.map((fact) => [fact.key, fact]));
    for (const adjustment of source.refund_adjustments) {
      const fact = factsByKey.get(adjustment.fact_key);
      if (!fact || fact.data_kind === "unknown") {
        issue("refund_attribution_unverified");
        saleFor(sales, adjustment.order_id).coverage_complete = false;
        continue;
      }
      if (fact.data_kind !== query.data_kind) continue;
      if (adjustment.currency_code !== query.currency_code) {
        issue("reporting_filter_mismatch");
        continue;
      }
      const instant = movementTime(fact);
      const amount = cents(adjustment.amount);
      const sellerReduction = cents(adjustment.seller_entitlement_reduced);
      const commissionReturned = cents(adjustment.commission_returned);
      if (
        instant === null ||
        amount === null ||
        sellerReduction === null ||
        commissionReturned === null
      ) {
        issue("refund_adjustment_unverified");
        saleFor(sales, adjustment.order_id).coverage_complete = false;
        continue;
      }
      if (
        fact.effect_status !== "confirmed" ||
        fact.reconciliation_status !== "matched"
      ) {
        issue("refund_adjustment_pending");
        saleFor(sales, adjustment.order_id).coverage_complete = false;
        continue;
      }
      const key = `${adjustment.fact_key}:${adjustment.operation_id}`;
      if (seenAdjustments.has(key)) {
        issue("duplicate_refund_adjustment");
        continue;
      }
      seenAdjustments.add(key);
      const sale = saleFor(sales, adjustment.order_id);
      if (instant < Date.parse(window.cutoff_at)) {
        cumulativeEarnings -= sellerReduction;
        sale.cumulative_earnings_cents -= sellerReduction;
      }
      if (!inRange(instant, window)) continue;
      sale.refunds_cents += amount;
      sale.commission_reversed_cents += commissionReturned;
      sale.seller_earnings_period_cents -= sellerReduction;
      commissionReversedPeriod += commissionReturned;
      sellerEarningsPeriod -= sellerReduction;
    }

    for (const cost of options.sellerView ? [] : source.costs) {
      if (!costKinds.has(cost.key)) continue;
      const kinds = costKinds.get(cost.key)!;
      if (kinds.size !== 1 || !kinds.has(query.data_kind)) continue;
      if (
        cost.mode !== query.mode ||
        cost.currency_code !== query.currency_code
      ) {
        issue("reporting_filter_mismatch");
        continue;
      }
      const previous = costs.get(cost.key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(cost)) {
        issue("provider_cost_conflict");
        continue;
      }
      costs.set(cost.key, cost);
    }
  }

  const seenCostKeys = new Set<string>();
  for (const source of options.sellerView ? [] : sourceSets) {
    for (const fact of source.facts) {
      if (
        fact.data_kind !== query.data_kind ||
        fact.mode !== query.mode ||
        fact.currency_code !== query.currency_code ||
        fact.effect_status !== "confirmed" ||
        fact.reconciliation_status !== "matched" ||
        !fact.balance_transaction_id
      )
        continue;
      const key = `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`;
      if (seenCostKeys.has(key)) continue;
      seenCostKeys.add(key);
      const cost = costs.get(key);
      const costInstant = cost?.provider_created_at
        ? Date.parse(cost.provider_created_at)
        : Number.NaN;
      if (Number.isFinite(costInstant) && !inRange(costInstant, window))
        continue;
      const movementInstant = movementTime(fact);
      if (
        !Number.isFinite(costInstant) &&
        movementInstant !== null &&
        !inRange(movementInstant, window)
      )
        continue;
      if (
        !cost ||
        cost.status !== "confirmed" ||
        cost.fee_minor === null ||
        !cost.provider_created_at
      ) {
        pendingFees++;
        issue("provider_fee_pending_or_unavailable");
        continue;
      }
      if (!Number.isFinite(costInstant)) {
        pendingFees++;
        issue("provider_fee_time_unknown");
        continue;
      }
      confirmedFeesPeriod += cost.fee_minor;
    }
  }

  if (options.sourceLimitReached) {
    for (const sale of sales.values()) sale.coverage_complete = false;
  }

  const salesRows = [...sales.values()]
    .filter(
      (sale) =>
        sale.capture_status !== "not_captured" ||
        sale.refunds_cents > 0 ||
        sale.transfers_net_cents !== 0,
    )
    .sort((left, right) =>
      (right.captured_at ?? "").localeCompare(left.captured_at ?? ""),
    )
    .map<FinanceReportingSale>((sale) => {
      const balance =
        sale.cumulative_earnings_cents - sale.cumulative_transfers_cents;
      return {
        order_id: sale.order_id,
        order_display_id: null,
        order_custom_display_id: null,
        capture_status: sale.capture_status,
        captured_at: sale.captured_at,
        captured_amount:
          sale.captured_amount_cents === null
            ? null
            : money(sale.captured_amount_cents),
        captured_in_period: money(sale.captured_period_cents),
        merchandise_collected:
          sale.merchandise_cents === null
            ? null
            : money(sale.merchandise_cents),
        merchandise_collected_in_period: money(sale.merchandise_period_cents),
        refunds_effective: money(sale.refunds_cents),
        refund_component_attribution:
          sale.refunds_cents > 0 ? "unallocated" : "unknown",
        gross_commission:
          sale.gross_commission_cents === null
            ? null
            : money(sale.gross_commission_cents),
        commission_recognized_in_period: money(sale.commission_period_cents),
        commission_reversed: money(sale.commission_reversed_cents),
        net_commission: money(
          sale.commission_period_cents - sale.commission_reversed_cents,
        ),
        seller_earnings:
          sale.capture_status === "unknown"
            ? null
            : money(sale.seller_earnings_period_cents),
        transfers_gross: money(sale.transfers_gross_cents),
        transfer_reversals: money(sale.transfer_reversals_cents),
        transferred_net: money(sale.transfers_net_cents),
        transfers_gross_to_cutoff: money(sale.cumulative_transfers_gross_cents),
        transfer_reversals_to_cutoff: money(
          sale.cumulative_transfer_reversals_cents,
        ),
        transferred_net_to_cutoff: money(sale.cumulative_transfers_cents),
        pending_settlement:
          sale.capture_status === "unknown" ? null : money(balance),
        coverage: sale.coverage_complete ? "complete" : "partial",
      };
    });

  const totals = {
    captured_volume: money(capturedPeriod),
    merchandise_gmv: money(merchandisePeriod),
    paid_vendor_orders: paidOrders,
    refunds_effective: money(refundsPeriod),
    net_captured_volume: money(capturedPeriod - refundsPeriod),
    gross_marketplace_commission: money(commissionPeriod),
    commission_reversed: money(commissionReversedPeriod),
    net_marketplace_commission: money(
      commissionPeriod - commissionReversedPeriod,
    ),
    result_after_fees:
      !options.sellerView && coverageComplete
        ? money(
            commissionPeriod - commissionReversedPeriod - confirmedFeesPeriod,
          )
        : null,
    vendor_earnings: money(sellerEarningsPeriod),
    transfers_gross: money(transfersGrossPeriod),
    transfer_reversals: money(transferReversalsPeriod),
    transfers_net: money(transfersPeriod),
    pending_settlement: money(cumulativeEarnings - cumulativeTransfers),
    confirmed_stripe_fees: options.sellerView
      ? null
      : money(confirmedFeesPeriod),
  };

  const sortedReasons = [...reasons]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => left.reason.localeCompare(right.reason));
  return {
    report: {
      filters: query,
      window,
      totals,
      coverage: {
        complete: coverageComplete,
        partial_reasons: sortedReasons,
        excluded_unknown_data_kind: unknownDataKind,
        excluded_unknown_effective_time: unknownEffectiveTime,
        pending_or_unavailable_fees: pendingFees,
        sales_truncated: Boolean(options.sourceLimitReached),
      },
      sales: salesRows,
    },
  };
}
