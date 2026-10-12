import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  ownedAdminReportingSources,
  type AdminReportingSource,
} from "../../modules/commerce-automation/admin-finance-reporting";
import type {
  AdminFinanceReportingResponse,
  FinanceReportingQuery,
} from "./contracts";
import { aggregateFinanceReporting } from "./reporting";
import { resolveFinanceReportingWindow } from "./reporting-period";
import type { FinanceReportingSources } from "./reporting-sources";

export function groupReportingSources(
  value: unknown,
  row: AdminReportingSource,
): FinanceReportingSources {
  return ownedAdminReportingSources(value, row);
}

function unavailableSource(groupId: string): FinanceReportingSources {
  return {
    facts: [],
    costs: [],
    capture_allocations: [],
    refund_adjustments: [],
    coverage: {
      complete: false,
      issues: [{ resource: groupId, reason: "reporting_source_unavailable" }],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
}

export function groupPendingSettlements(
  report: Pick<
    AdminFinanceReportingResponse["report"],
    "totals" | "sales" | "coverage"
  >,
  references: ReadonlyMap<string, AdminReportingSource["references"][number]>,
): AdminFinanceReportingResponse["report"]["pending_settlements"] {
  const total = report.totals.pending_settlement;
  if (total === null || !Number.isFinite(total)) return null;
  const amounts = new Map<string, ReturnType<typeof MathBN.convert>>();
  const orders = new Set<string>();
  let complete = report.coverage.complete;
  for (const sale of report.sales) {
    if (sale.pending_settlement === null) {
      complete = false;
      continue;
    }
    const sellerId = references.get(sale.order_id)?.seller_id;
    if (
      !sellerId ||
      orders.has(sale.order_id) ||
      !Number.isFinite(sale.pending_settlement)
    )
      return null;
    orders.add(sale.order_id);
    amounts.set(
      sellerId,
      MathBN.add(amounts.get(sellerId) ?? 0, sale.pending_settlement),
    );
  }
  // A group-level transfer without an order attribution cannot be distributed
  // by seller. Reconcile the complete balance before presenting any breakdown.
  const sum = [...amounts.values()].reduce(
    (amount, next) => MathBN.add(amount, next),
    MathBN.convert(0),
  );
  if (!MathBN.eq(sum, total)) return null;
  return {
    stores: [...amounts]
      .filter(([, amount]) => !MathBN.eq(amount, 0))
      .map(([seller_id, amount]) => ({
        seller_id,
        seller_name: null,
        amount: amount.toNumber(),
      }))
      .sort((left, right) => left.seller_id.localeCompare(right.seller_id)),
    complete:
      complete && report.sales.every((sale) => sale.coverage === "complete"),
  };
}

/** Internal read after the HTTP caller proves current operator authority.
 * One private registry snapshot plus the existing financial arithmetic. */
export async function readAdminReportingProjection(
  container: MedusaContainer,
  input: {
    actor_id: string;
    query: FinanceReportingQuery;
    generated_at?: Date;
    signal?: AbortSignal;
  },
): Promise<AdminFinanceReportingResponse> {
  input.signal?.throwIfAborted();
  if (!input.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión.",
    );
  const registry = await container
    .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
    .readAdminFinanceReportingRegistry();
  input.signal?.throwIfAborted();
  const sources: FinanceReportingSources[] = [];
  let pendingGroups = 0;
  let principalIncomplete = false;
  let attributionIncomplete = false;
  let balancesIncomplete = false;
  const verifiedReferences = new Map<
    string,
    AdminReportingSource["references"][number]
  >();
  for (const row of registry.rows) {
    try {
      if (!row.is_fresh || row.unsafe)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Reporting projection awaits verification.",
        );
      const source = groupReportingSources(row.sources, row);
      if (
        source.coverage.issues.some((issue) =>
          ["reporting_source_unavailable", "reporting_read_changed"].includes(
            issue.reason,
          ),
        )
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Native reporting verification has not completed.",
        );
      const matchesFilter = [
        ...source.facts,
        ...source.capture_allocations,
      ].some(
        (part) =>
          part.data_kind === input.query.data_kind ||
          part.data_kind === "unknown",
      );
      if (
        matchesFilter &&
        !source.coverage.complete &&
        (!source.coverage.issues.length ||
          source.coverage.issues.some(
            (issue) => !/cost|fee/i.test(issue.reason),
          ))
      )
        principalIncomplete = true;
      for (const reference of row.references) {
        if (verifiedReferences.has(reference.id)) attributionIncomplete = true;
        verifiedReferences.set(reference.id, reference);
      }
      if (
        row.references.some(
          (reference) =>
            !source.capture_allocations.some(
              (allocation) => allocation.order_id === reference.id,
            ),
        )
      )
        balancesIncomplete = true;
      if (
        source.facts.some(
          (fact) =>
            fact.data_kind === input.query.data_kind &&
            fact.mode === input.query.mode &&
            fact.currency_code === input.query.currency_code &&
            ["transfer", "reversal"].includes(fact.kind) &&
            !fact.order_id,
        )
      )
        attributionIncomplete = true;
      sources.push(source);
    } catch {
      pendingGroups++;
      sources.push(unavailableSource(row.id));
    }
  }
  const result = aggregateFinanceReporting(
    input.query,
    resolveFinanceReportingWindow(
      input.query.period,
      input.generated_at ?? new Date(),
    ),
    sources,
    { sourceLimitReached: registry.truncated },
  );
  const references = new Map(
    registry.rows.flatMap((row) =>
      row.references.map((reference) => [reference.id, reference] as const),
    ),
  );
  result.report.sales = result.report.sales.map((sale) => ({
    ...sale,
    order_display_id: references.get(sale.order_id)?.order_display_id ?? null,
    order_custom_display_id:
      references.get(sale.order_id)?.order_custom_display_id ?? null,
  }));
  const response: AdminFinanceReportingResponse = {
    report: {
      ...result.report,
      pending_settlements: null,
      freshness: {
        refreshed_at: null,
        pending_groups: pendingGroups,
        discovery_complete: registry.discovery.complete,
      },
    },
  };
  if (!registry.discovery.complete) {
    response.report.coverage.complete = false;
    response.report.coverage.partial_reasons.push({
      reason: "reporting_discovery_incomplete",
      count: 1,
    });
  }
  if (pendingGroups)
    response.report.coverage.partial_reasons.push({
      reason: "reporting_projection_pending",
      count: pendingGroups,
    });
  const hasVerifiedSales = response.report.sales.some(
    (sale) =>
      sale.capture_status === "confirmed" && sale.coverage === "complete",
  );
  if (
    pendingGroups ||
    !registry.discovery.complete ||
    registry.truncated ||
    (principalIncomplete && !hasVerifiedSales)
  ) {
    for (const key of Object.keys(response.report.totals) as Array<
      keyof typeof response.report.totals
    >)
      response.report.totals[key] = null;
  } else {
    const refreshed = registry.rows
      .flatMap((row) => (row.refreshed_at ? [row.refreshed_at] : []))
      .sort();
    response.report.freshness.refreshed_at = refreshed[0] ?? null;
  }
  const pendingSettlements = attributionIncomplete
    ? null
    : groupPendingSettlements(response.report, verifiedReferences);
  if (pendingSettlements && balancesIncomplete)
    pendingSettlements.complete = false;
  input.signal?.throwIfAborted();
  if (pendingSettlements?.stores.length) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    try {
      const { data: sellers } = await query.graph(
        {
          entity: "seller",
          fields: ["id", "name"],
          filters: {
            id: pendingSettlements.stores.map((store) => store.seller_id),
          },
          pagination: { skip: 0, take: pendingSettlements.stores.length },
        },
        { cache: { enable: false } },
      );
      input.signal?.throwIfAborted();
      const names = new Map(sellers.map((seller) => [seller.id, seller.name]));
      pendingSettlements.stores = pendingSettlements.stores.map((store) => ({
        ...store,
        seller_name: names.get(store.seller_id) ?? null,
      }));
    } catch {
      input.signal?.throwIfAborted();
      pendingSettlements.complete = false;
    }
  }
  response.report.pending_settlements = pendingSettlements;
  input.signal?.throwIfAborted();
  return response;
}
