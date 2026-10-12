import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { parseISO } from "date-fns/parseISO";
import { isValid } from "date-fns/isValid";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import { readFinanceExecutionWriters } from "../../modules/commerce-automation/service";
import type {
  SettlementProjection,
  SettlementSourceRow,
} from "../../modules/commerce-automation/vendor-settlements";
import {
  vendorSettlementsQuerySchema,
  type VendorSettlementsQuery,
  type VendorSettlementsResponse,
} from "./contracts";
import {
  automaticSettlementEnabled,
  orderCompletionSchema,
} from "./automatic-settlement";
import {
  FINANCE_REPORTING_TIME_ZONE,
  resolveFinanceReportingWindow,
} from "./reporting-period";
import {
  readOrderFinanceReportingSources,
  type FinanceReportingSources,
} from "./record-provider-facts";
import { aggregateFinanceReporting } from "./reporting";
import { readOrderFinance } from "./read";
import {
  assertSettlementCapture,
  settlementPlanSchema,
} from "./settlement-plan";
import { saveSettlementProjectionAndNotify } from "./settlement-notifications";

const PROJECTION_ACTOR = "system:vendor-settlement-projection";
const nativeOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  display_id: z.number().int().nullish(),
  custom_display_id: z.string().nullish(),
  updated_at: z
    .union([z.date(), z.iso.datetime({ offset: true })])
    .transform((value) => (typeof value === "string" ? parseISO(value) : value))
    .refine(isValid),
  seller: z.object({
    id: z.string(),
    status: z.string(),
    payout_account: z.object({ status: z.string() }).nullish(),
  }),
});
const payoutResultSchema = z.object({
  action: z.literal("payout"),
  order_id: z.string(),
  plan: settlementPlanSchema,
  linked: z.boolean().optional(),
  transfer_id: z.string().optional(),
});

/** This request only reads the registry; reconciliation belongs to the worker. */
export async function readVendorSettlements(
  container: MedusaContainer,
  input: {
    actor_id: string;
    seller_id: string;
    query: VendorSettlementsQuery;
    generated_at?: Date;
  },
): Promise<VendorSettlementsResponse> {
  if (!input.actor_id.trim())
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión.",
    );
  if (!input.seller_id.trim())
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Selecciona una tienda.",
    );
  const query = vendorSettlementsQuerySchema.parse(input.query);
  const now = input.generated_at ?? new Date();
  const registry = await container
    .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
    .readVendorSettlements({
      seller_id: input.seller_id,
      data_kind: query.data_kind,
      limit: query.limit,
      offset: query.offset,
      now,
    });
  const automaticEnabled = await automaticSettlementEnabled(container);
  return {
    settlements: {
      mode: query.mode,
      currency_code: query.currency_code,
      data_kind: query.data_kind,
      automatic_enabled: automaticEnabled,
      generated_at: now.toISOString(),
      time_zone: FINANCE_REPORTING_TIME_ZONE,
      count: registry.count,
      total_pending: registry.total_pending,
      next_release_at: automaticEnabled
        ? (registry.next_release_at?.toISOString() ?? null)
        : null,
      unknown_amount_count: registry.unknown_amount_count,
      limit: query.limit,
      offset: query.offset,
      items: registry.items.map((item) => ({
        ...item,
        completed_at: item.completed_at.toISOString(),
        eligible_at: item.eligible_at.toISOString(),
        updated_at: item.updated_at?.toISOString() ?? null,
        status:
          item.status === "waiting" &&
          item.eligible_at.getTime() <= now.getTime()
            ? "due"
            : item.status,
      })),
    },
  };
}

export function buildSettlementProjection(input: {
  completion: SettlementSourceRow;
  current: Awaited<ReturnType<typeof readOrderFinance>>;
  sources: FinanceReportingSources;
  native_order: unknown;
  now: Date;
}): SettlementProjection {
  const { completion, current, sources } = input;
  const base: SettlementProjection = {
    id: completion.id,
    group_id: completion.group_id,
    cart_id: completion.cart_id,
    seller_id: completion.seller_id,
    data_kind: "unknown",
    pending_amount: null,
    status: "needs_review",
    projection: {
      order_display_id: null,
      order_custom_display_id: null,
      reason: "El importe pendiente requiere verificación financiera.",
    },
  };
  const order = nativeOrderSchema.safeParse(input.native_order);
  const own = current.group.orders.find((row) => row.id === completion.id);
  if (
    !order.success ||
    order.data.id !== completion.id ||
    order.data.seller.id !== completion.seller_id ||
    own?.seller.id !== completion.seller_id ||
    current.group.id !== completion.group_id ||
    current.group.cart_id !== completion.cart_id
  )
    return base;
  if (own.status !== order.data.status) return base;
  base.projection.order_display_id = order.data.display_id ?? null;
  base.projection.order_custom_display_id =
    order.data.custom_display_id ?? null;
  const allocation = sources.capture_allocations.find(
    (row) => row.order_id === completion.id,
  );
  if (allocation) base.data_kind = allocation.data_kind;
  if (order.data.status !== "completed")
    return {
      ...base,
      status: "inactive",
      projection: { ...base.projection, reason: null },
    };
  orderCompletionSchema.parse(completion);
  if (
    order.data.updated_at.getTime() !==
    completion.observed_order_updated_at.getTime()
  ) {
    base.projection.reason =
      "El pedido cambió después de completarse y requiere revisión.";
    return base;
  }
  const payout = current.operations.find(
    (row) => row.id === `payout:${completion.id}`,
  );
  if (payout?.state === "processing")
    return {
      ...base,
      status: "processing",
      projection: {
        ...base.projection,
        reason: "La transferencia está en proceso de confirmación.",
      },
    };
  if (payout?.state === "uncertain") {
    base.projection.reason =
      "La transferencia requiere revisión. No se volverá a enviar automáticamente.";
    return base;
  }
  if (
    current.financialProblem ||
    current.hasPendingChanges ||
    MathBN.lt(
      current.group.orders.find((order) => order.id === completion.id)
        ?.summary?.pending_difference ?? 0,
      0,
    ) ||
    current.state?.review_required ||
    current.state?.active_token ||
    readFinanceExecutionWriters(current.state?.observation).length ||
    current.operations.some((row) => row.state !== "complete")
  )
    return base;
  try {
    assertSettlementCapture(current);
  } catch {
    return base;
  }
  if (
    !allocation ||
    allocation.status !== "confirmed" ||
    allocation.component_attribution !== "original_snapshot" ||
    allocation.data_kind === "unknown"
  )
    return base;
  const window = resolveFinanceReportingWindow("today", input.now);
  const result = aggregateFinanceReporting(
    {
      mode: "test",
      currency_code: "usd",
      data_kind: allocation.data_kind,
      period: "today",
    },
    window,
    [sources],
    { sellerView: true },
  ).report;
  const sale = result.sales.find((row) => row.order_id === completion.id);
  if (
    !result.coverage.complete ||
    sale?.coverage !== "complete" ||
    sale.pending_settlement === null ||
    sale.pending_settlement < 0
  )
    return base;
  if (sale.pending_settlement === 0) {
    const evidence = payoutResultSchema.safeParse(payout?.result);
    const plan = evidence.success ? evidence.data.plan : null;
    if (
      payout?.state === "complete" &&
      evidence.success &&
      plan &&
      evidence.data.order_id === completion.id &&
      plan.order_id === completion.id &&
      plan.seller_id === completion.seller_id &&
      plan.group_id === completion.group_id &&
      plan.cart_id === completion.cart_id &&
      plan.original_gross === current.original?.gross &&
      plan.original_commission === current.original.commission &&
      plan.original_seller_entitlement ===
        current.original.seller_entitlement &&
      plan.payment_id ===
        current.group.orders[0].cart.payment_collection.payments[0].id &&
      plan.payment_intent_id ===
        current.group.orders[0].cart.payment_collection.payments[0].data.id &&
      (plan.outcome === "no_transfer_required" ||
        (evidence.data.linked && evidence.data.transfer_id))
    )
      return {
        ...base,
        status: "released",
        pending_amount: 0,
        projection: { ...base.projection, reason: null },
      };
    return base;
  }
  base.pending_amount = sale.pending_settlement;
  if (payout) {
    base.projection.reason =
      "La transferencia registrada requiere conciliación con el saldo pendiente.";
    return base;
  }
  if (
    order.data.seller.status !== "open" ||
    order.data.seller.payout_account?.status !== "active"
  ) {
    base.projection.reason =
      "Revisa la configuración de la tienda y de la cuenta de cobro.";
    return base;
  }
  return {
    ...base,
    status: "waiting",
    projection: {
      ...base.projection,
      reason:
        "La liberación está sujeta a las verificaciones finales del pedido y de la cuenta de cobro.",
    },
  };
}

/** Sequential, bounded read-model refresh; it never executes a financial workflow. */
export async function reconcileVendorSettlementProjections(
  container: MedusaContainer,
  input: { take?: number; lock_owner_id?: string } = {},
) {
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const groups = await journal.listDirtyVendorSettlementGroups({
    take: input.take ?? 5,
    now: new Date(),
  });
  let saved = 0;
  for (const groupId of groups) {
    const source = await journal.readVendorSettlementGroupSource(groupId);
    if (!source.length) continue;
    const projections: SettlementProjection[] = [];
    const { data: orders } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "order",
          fields: [
            "id",
            "status",
            "display_id",
            "custom_display_id",
            "updated_at",
            "seller.id",
            "seller.status",
            "seller.payout_account.status",
          ],
          filters: { id: source.map((row) => row.id) },
          pagination: { skip: 0, take: source.length },
        },
        { cache: { enable: false } },
      );
    for (const completion of source) {
      try {
        const sources = await readOrderFinanceReportingSources(container, {
          order_id: completion.id,
          actor_id: PROJECTION_ACTOR,
          seller_id: completion.seller_id,
        });
        const current = await readOrderFinance(container, completion.id, {
          actor_id: PROJECTION_ACTOR,
          seller_id: completion.seller_id,
        });
        const matches = orders.filter((row) => row.id === completion.id);
        projections.push(
          buildSettlementProjection({
            completion,
            current,
            sources,
            native_order: matches.length === 1 ? matches[0] : null,
            now: new Date(),
          }),
        );
      } catch {
        projections.push({
          id: completion.id,
          group_id: completion.group_id,
          cart_id: completion.cart_id,
          seller_id: completion.seller_id,
          data_kind: "unknown",
          pending_amount: null,
          status: "needs_review",
          projection: {
            order_display_id: null,
            order_custom_display_id: null,
            reason: "El importe pendiente requiere verificación financiera.",
          },
        });
      }
    }
    if (input.lock_owner_id)
      await container
        .resolve(Modules.LOCKING)
        .acquire("vendor-settlement-projections", {
          ownerId: input.lock_owner_id,
          expire: 120,
        });
    if (
      await saveSettlementProjectionAndNotify(container, journal, {
        source,
        projections,
        refreshed_at: new Date(),
      })
    )
      saved++;
  }
  return { groups: groups.length, saved };
}
