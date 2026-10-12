import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  reportingReferenceSchema,
  type ReportingReference,
} from "../../modules/commerce-automation/vendor-finance-reporting";
import type {
  FinanceReportingQuery,
  VendorFinanceReportingResponse,
} from "./contracts";
import { aggregateFinanceReporting } from "./reporting";
import { resolveFinanceReportingWindow } from "./reporting-period";
import {
  readSellerGroupFinanceReportingSources,
  sellerFinanceReportingSources,
  type FinanceReportingSources,
} from "./record-provider-facts";
import { sellerReportingSourcesSchema } from "./reporting-sources";
import { saveReportingProjectionAndNotify } from "./reporting-notifications";

const PROJECTION_ACTOR = "vendor-finance-reporting-projection";
const DISCOVERY_PAGE_SIZE = 50;
const referenceFields = [
  "id",
  "cart_id",
  "orders.id",
  "orders.display_id",
  "orders.custom_display_id",
  "orders.updated_at",
  "orders.version",
  "orders.status",
  "orders.seller.id",
];
const groupReferenceSchema = z.object({
  id: z.string().min(1),
  cart_id: z.string().min(1),
  orders: z.array(
    z.object({
      id: z.string().startsWith("order_"),
      display_id: z.number().int().nullable().optional(),
      custom_display_id: z.string().nullable().optional(),
      updated_at: z.union([z.iso.datetime({ offset: true }), z.date()]),
      version: z.number().int(),
      status: z.string(),
      seller: z.object({ id: z.string().min(1) }),
    }),
  ),
});

export function reportingReferences(groups: unknown): ReportingReference[] {
  return groupReferenceSchema
    .array()
    .parse(groups)
    .flatMap((group) =>
      group.orders.map((order) =>
        reportingReferenceSchema.parse({
          id: order.id,
          group_id: group.id,
          cart_id: group.cart_id,
          seller_id: order.seller.id,
          order_display_id: order.display_id ?? null,
          order_custom_display_id: order.custom_display_id ?? null,
          native_revision: JSON.stringify({
            updated_at:
              order.updated_at instanceof Date
                ? order.updated_at.toISOString()
                : order.updated_at,
            version: order.version,
            status: order.status,
          }),
        }),
      ),
    );
}

export function ownedReportingSources(
  value: unknown,
  reference: Pick<ReportingReference, "id" | "seller_id" | "group_id">,
): FinanceReportingSources {
  const sources = sellerReportingSourcesSchema.parse(value);
  if (
    sources.facts.some(
      (fact) =>
        fact.order_id !== reference.id ||
        fact.seller_id !== reference.seller_id ||
        fact.group_id !== reference.group_id,
    ) ||
    sources.capture_allocations.some(
      (part) =>
        part.order_id !== reference.id ||
        part.seller_id !== reference.seller_id ||
        part.group_id !== reference.group_id,
    ) ||
    sources.refund_adjustments.some(
      (part) =>
        part.order_id !== reference.id ||
        part.seller_id !== reference.seller_id,
    ) ||
    sources.coverage.issues.some((issue) => issue.resource !== reference.id) ||
    sources.coverage.lists.length
  )
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Reporting sources are not scoped to their seller order.",
    );
  return sources;
}

function unavailableSource(orderId: string): FinanceReportingSources {
  return {
    facts: [],
    costs: [],
    capture_allocations: [],
    refund_adjustments: [],
    coverage: {
      complete: false,
      issues: [{ resource: orderId, reason: "reporting_source_unavailable" }],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
}

/** One private registry read and pure arithmetic; never a native financial read or provider call. */
export async function readVendorFinanceReporting(
  container: MedusaContainer,
  input: {
    actor_id: string;
    seller_id: string;
    query: FinanceReportingQuery;
    generated_at?: Date;
  },
): Promise<VendorFinanceReportingResponse> {
  if (!input.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión.",
    );
  if (!input.seller_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Selecciona una tienda.",
    );
  const now = input.generated_at ?? new Date();
  const registry = await container
    .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
    .readVendorFinanceReportingRegistry({ seller_id: input.seller_id, now });
  const sources: FinanceReportingSources[] = [];
  const verifiedOrders = new Set<string>();
  let pendingOrders = 0;
  let verificationIncomplete = false;
  for (const row of registry.rows) {
    try {
      if (row.seller_id !== input.seller_id || !row.is_fresh)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Unverified reporting projection.",
        );
      const source = ownedReportingSources(row.sources, row);
      const matchesFilter =
        [...source.facts, ...source.capture_allocations].some(
          (part) =>
            part.data_kind === input.query.data_kind ||
            part.data_kind === "unknown",
        ) ||
        (!source.facts.length && !source.capture_allocations.length);
      const principalIncomplete =
        matchesFilter &&
        !source.coverage.complete &&
        (!source.coverage.issues.length ||
          source.coverage.issues.some(
            (issue) => !/cost|fee/i.test(issue.reason),
          ));
      if (principalIncomplete) verificationIncomplete = true;
      if (matchesFilter && row.unsafe) {
        verificationIncomplete = true;
        sources.push(unavailableSource(row.id));
        continue;
      }
      if (matchesFilter && !principalIncomplete) verifiedOrders.add(row.id);
      sources.push(source);
    } catch {
      pendingOrders++;
      sources.push(unavailableSource(row.id));
    }
  }
  const aggregated = aggregateFinanceReporting(
    input.query,
    resolveFinanceReportingWindow(input.query.period, now),
    sources,
    { sellerView: true, sourceLimitReached: registry.truncated },
  );
  const result: VendorFinanceReportingResponse = {
    report: {
      ...aggregated.report,
      freshness: {
        refreshed_at: null,
        pending_orders: 0,
        discovery_complete: false,
      },
    },
  };
  const incomplete =
    pendingOrders > 0 ||
    verificationIncomplete ||
    !result.report.coverage.complete ||
    !registry.discovery.complete ||
    registry.truncated;
  if (verificationIncomplete && result.report.coverage.complete) {
    result.report.coverage.complete = false;
    result.report.coverage.partial_reasons.push({
      reason: "reporting_source_incomplete",
      count: 1,
    });
  }
  if (!registry.discovery.complete) {
    result.report.coverage.complete = false;
    result.report.coverage.partial_reasons.push({
      reason: "reporting_discovery_incomplete",
      count: 1,
    });
  }
  const hasVerifiedSales = result.report.sales.some(
    (sale) =>
      verifiedOrders.has(sale.order_id) &&
      sale.capture_status === "confirmed" &&
      sale.coverage === "complete",
  );
  const totalsUnavailable =
    pendingOrders > 0 ||
    !registry.discovery.complete ||
    registry.truncated ||
    (incomplete && !hasVerifiedSales);
  if (totalsUnavailable) {
    // Keep verified subtotals in a partial report; an unprepared registry or
    // evidence with no verified sales must not manufacture an empty zero.
    for (const key of Object.keys(result.report.totals) as Array<
      keyof typeof result.report.totals
    >)
      result.report.totals[key] = null;
  }
  const references = new Map(registry.rows.map((row) => [row.id, row]));
  result.report.sales = result.report.sales.map((sale) => ({
    ...sale,
    order_display_id: references.get(sale.order_id)?.order_display_id ?? null,
    order_custom_display_id:
      references.get(sale.order_id)?.order_custom_display_id ?? null,
  }));
  const refreshed = registry.rows
    .flatMap((row) =>
      row.is_fresh && row.refreshed_at ? [row.refreshed_at] : [],
    )
    .sort();
  result.report.freshness = {
    refreshed_at: pendingOrders || !refreshed.length ? null : refreshed[0],
    pending_orders: pendingOrders,
    discovery_complete: registry.discovery.complete,
  };
  return result;
}

export async function discoverVendorReportingOrders(
  container: MedusaContainer,
) {
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const expected = await journal.readVendorReportingDiscovery();
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "order_group",
        fields: referenceFields,
        filters: expected.cursor ? { id: { $gt: expected.cursor } } : {},
        pagination: {
          skip: 0,
          take: DISCOVERY_PAGE_SIZE,
          order: { id: "ASC" },
        },
      },
      { cache: { enable: false } },
    );
  const groups = groupReferenceSchema.array().parse(data);
  const ended = groups.length < DISCOVERY_PAGE_SIZE;
  const saved = await journal.saveVendorReportingDiscovery({
    expected,
    references: reportingReferences(groups),
    next: {
      cursor: ended ? null : groups[groups.length - 1].id,
      complete: expected.complete || ended,
    },
  });
  return {
    groups: groups.length,
    saved,
    discovery_complete: expected.complete || ended,
  };
}

/** Invalidation observes native identities only; no financial changes run from events. */
export async function invalidateVendorReporting(
  container: MedusaContainer,
  input: { order_ids?: string[]; group_id?: string },
) {
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  let groupIds: string[] = input.group_id ? [input.group_id] : [];
  if (input.order_ids?.length) {
    await journal.invalidateVendorFinanceReporting(input.order_ids);
    const { data } = await query.graph(
      {
        entity: "order_group_order",
        fields: ["order_group_id"],
        filters: { order_id: input.order_ids },
      },
      { cache: { enable: false } },
    );
    groupIds = [
      ...new Set(
        data.map((link: { order_group_id: string }) => link.order_group_id),
      ),
    ];
  }
  if (!groupIds.length) return;
  const { data } = await query.graph(
    {
      entity: "order_group",
      fields: referenceFields,
      filters: { id: groupIds },
    },
    { cache: { enable: false } },
  );
  const references = reportingReferences(data);
  await journal.registerVendorReportingReferences(references);
  await journal.invalidateVendorFinanceReporting(
    references.map((row) => row.id),
  );
}

/** Refresh up to two groups; TTL schedules work without invalidating unchanged verified data. */
export async function reconcileVendorReportingProjections(
  container: MedusaContainer,
  input: { lock_owner_id?: string } = {},
) {
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const discovery = await discoverVendorReportingOrders(container);
  const [adminGroups, vendorGroups] = await Promise.all([
    journal.listDirtyAdminReportingGroups(),
    journal.listDirtyVendorReportingGroups(),
  ]);
  const groups = [...new Set([...adminGroups, ...vendorGroups])].slice(0, 2);
  let saved = 0;
  for (const groupId of groups) {
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "order_group",
          fields: referenceFields,
          filters: { id: groupId },
        },
        { cache: { enable: false } },
      );
    const references = reportingReferences(data);
    await journal.registerVendorReportingReferences(references);
    const source = await journal.readVendorReportingGroupSource(groupId);
    if (!source.length) continue;
    const adminSource = await journal.readAdminReportingGroupSource(groupId);
    if (!adminSource) continue;
    const projections: Array<{ id: string; sources: FinanceReportingSources }> =
      [];
    let sharedSources: FinanceReportingSources | null = null;
    try {
      const anchor = source.find(
        (row) =>
          !row.unsafe &&
          references.some(
            (reference) =>
              reference.id === row.id &&
              reference.seller_id === row.seller_id &&
              reference.cart_id === row.cart_id,
          ),
      );
      if (anchor)
        sharedSources = await readSellerGroupFinanceReportingSources(
          container,
          {
            order_id: anchor.id,
            seller_id: anchor.seller_id,
            actor_id: PROJECTION_ACTOR,
          },
        );
    } catch {
      /* A failed native verification cannot establish a monetary total. */
    }
    for (const row of source) {
      try {
        if (row.unsafe)
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Financial reconciliation is in progress.",
          );
        if (
          !references.some(
            (reference) =>
              reference.id === row.id &&
              reference.seller_id === row.seller_id &&
              reference.cart_id === row.cart_id,
          )
        )
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Native order missing from its reporting group.",
          );
        if (!sharedSources)
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Native reporting sources are unavailable.",
          );
        projections.push({
          id: row.id,
          sources: ownedReportingSources(
            sellerFinanceReportingSources(sharedSources, row.id),
            row,
          ),
        });
      } catch {
        projections.push({ id: row.id, sources: unavailableSource(row.id) });
      }
    }
    if (input.lock_owner_id)
      await container
        .resolve(Modules.LOCKING)
        .acquire("vendor-finance-reporting-projections", {
          ownerId: input.lock_owner_id,
          expire: 120,
        });
    if (
      await saveReportingProjectionAndNotify(container, journal, {
        source,
        projections,
        refreshed_at: new Date(),
        admin: {
          source: adminSource,
          sources: sharedSources ?? unavailableSource(groupId),
        },
      })
    )
      saved++;
  }
  return { discovery, groups: groups.length, saved };
}
