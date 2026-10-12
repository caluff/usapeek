import { randomUUID } from "node:crypto";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { sellerReportingSourcesSchema } from "../../lib/order-finance/reporting-sources";

export const REPORTING_DISCOVERY_ID = "vendor-finance-reporting-discovery";
export const MAX_VENDOR_REPORTING_ORDERS = 2_000;
const discoverySchema = z.object({
  cursor: z.string().nullable(),
  complete: z.boolean(),
});
export type ReportingDiscovery = z.infer<typeof discoverySchema>;
export const reportingReferenceSchema = z.object({
  id: z.string().startsWith("order_"),
  seller_id: z.string().min(1),
  group_id: z.string().min(1),
  cart_id: z.string().min(1),
  native_revision: z.string().nullable(),
  order_display_id: z.number().int().nullable(),
  order_custom_display_id: z.string().nullable(),
});
export type ReportingReference = z.infer<typeof reportingReferenceSchema>;
export const reportingSourceSchema = reportingReferenceSchema.extend({
  source_revision: z.string(),
  invalidation_token: z.string().nullable(),
  unsafe: z.boolean(),
});
export type ReportingSource = z.infer<typeof reportingSourceSchema>;
const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));
const reportingReadRowSchema = reportingSourceSchema.extend({
  is_fresh: z.boolean(),
  refreshed_at: instant.nullable(),
  sources: z.unknown().nullable(),
});
export type ReportingReadRow = z.infer<typeof reportingReadRowSchema>;

function database(manager: EntityManager) {
  return manager.getTransactionContext() ?? manager.getKnex();
}

// This registry covers every financial original, including orders never completed.
// Thin native discovery adds historical orders without originals, so those remain partial.
const SCOPE_SQL = `select p.id, p.seller_id, p.group_id, p.cart_id, p.native_revision,
  p.order_display_id, p.order_custom_display_id, p.source_revision,
  p.invalidation_token, p.evaluated_token, p.refreshed_at, p.sources
  from vendor_finance_reporting_projection p where p.deleted_at is null
  union all
  select a.id, a.seller_id, a.group_id, a.cart_id, null::text, null::integer, null::text,
    null::text, null::text, null::text, null::timestamptz, null::jsonb
  from finance_sale_snapshot a where a.deleted_at is null
    and not exists (select 1 from vendor_finance_reporting_projection p where p.id = a.id and p.deleted_at is null)`;

// Hash semantic contents too: same timestamp is not proof that a journal is unchanged.
const REVISION_SQL = `md5(concat_ws('|', c.id, c.seller_id, c.group_id, c.cart_id, c.native_revision,
  s.updated_at::text, s.cart_id, s.active_token, s.review_required::text, s.observation::text,
  (select string_agg(a.id || ':' || a.seller_id || ':' || a.updated_at::text || ':' || a.original::text, '|' order by a.id)
    from finance_sale_snapshot a where a.group_id = c.group_id and a.deleted_at is null),
  (select string_agg(o.id || ':' || o.state || ':' || o.updated_at::text || ':' || coalesce(o.result::text, ''), '|' order by o.id)
    from commerce_operation o where o.group_id = c.group_id and o.deleted_at is null),
  (select string_agg(f.id || ':' || f.updated_at::text || ':' || f.fact::text, '|' order by f.id)
    from finance_provider_fact f where f.group_id = c.group_id and f.deleted_at is null)))`;
const SOURCE_SQL = `select c.*, ${REVISION_SQL} as current_source_revision,
  coalesce(s.cart_id <> c.cart_id or s.active_token is not null or s.review_required
    or (s.observation->'finance_execution_writers' is not null
      and s.observation->'finance_execution_writers' <> '[]'::jsonb), false) as unsafe,
  coalesce(c.source_revision = ${REVISION_SQL}
    and c.invalidation_token is not distinct from c.evaluated_token
    and c.sources is not null, false) as is_fresh
  from (${SCOPE_SQL}) c left join commerce_group_state s on s.id = c.group_id and s.deleted_at is null`;

export async function readReportingDiscovery(
  manager: EntityManager,
): Promise<ReportingDiscovery> {
  const row = await database(manager)("commerce_scan")
    .where({ id: REPORTING_DISCOVERY_ID })
    .whereNull("deleted_at")
    .first("position");
  if (!row?.position) return { cursor: null, complete: false };
  return discoverySchema.parse(JSON.parse(row.position));
}

export async function readVendorReportingRegistry(
  manager: EntityManager,
  input: { seller_id: string; now: Date },
): Promise<{
  rows: ReportingReadRow[];
  discovery: ReportingDiscovery;
  truncated: boolean;
}> {
  const parsed = z
    .object({ seller_id: z.string().min(1), now: z.date() })
    .parse(input);
  // Discovery state and rows are read in the same SQL snapshot.
  const result = await database(manager).raw(
    `with scoped as (${SOURCE_SQL} where c.seller_id = ?),
    page as (select * from scoped order by id limit ?)
    select coalesce((select jsonb_agg(page order by id) from page), '[]'::jsonb) as rows,
      (select position from commerce_scan where id = ? and deleted_at is null) as discovery`,
    [parsed.seller_id, MAX_VENDOR_REPORTING_ORDERS + 1, REPORTING_DISCOVERY_ID],
  );
  const rows = result.rows[0].rows as Array<Record<string, unknown>>;
  return {
    rows: rows
      .slice(0, MAX_VENDOR_REPORTING_ORDERS)
      .map((row) =>
        reportingReadRowSchema.parse({
          ...row,
          source_revision: row.current_source_revision,
        }),
      ),
    truncated: rows.length > MAX_VENDOR_REPORTING_ORDERS,
    discovery: result.rows[0].discovery
      ? discoverySchema.parse(JSON.parse(result.rows[0].discovery))
      : { cursor: null, complete: false },
  };
}

export async function listDirtyReportingGroups(
  manager: EntityManager,
  now: Date,
): Promise<string[]> {
  const result = await database(manager).raw(
    `with scoped as (${SOURCE_SQL})
    select group_id from scoped where not is_fresh or refreshed_at < ?::timestamptz - interval '10 minutes'
    group by group_id order by bool_and(is_fresh), min(coalesce(refreshed_at, '1970-01-01'::timestamptz)), group_id limit 1`,
    [now],
  );
  return z
    .array(z.object({ group_id: z.string() }))
    .parse(result.rows)
    .map((row) => row.group_id);
}

export async function readReportingGroupSource(
  manager: EntityManager,
  groupId: string,
): Promise<ReportingSource[]> {
  const result = await database(manager).raw(
    `with scoped as (${SOURCE_SQL} where c.group_id = ?)
    select *, current_source_revision as source_revision from scoped order by id`,
    [groupId],
  );
  return reportingSourceSchema.array().parse(result.rows);
}

export async function registerReportingReferences(
  manager: EntityManager,
  references: ReportingReference[],
): Promise<void> {
  const parsed = reportingReferenceSchema
    .array()
    .parse(references)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!parsed.length) return;
  if (new Set(parsed.map((row) => row.id)).size !== parsed.length)
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Reporting references contain duplicate orders.",
    );
  const existingRows = await database(manager)(
    "vendor_finance_reporting_projection",
  )
    .whereIn(
      "id",
      parsed.map((row) => row.id),
    )
    .orderBy("id")
    .forUpdate()
    .select("*");
  const existingById = new Map<string, Record<string, unknown>>(
    existingRows.map((row: Record<string, unknown>) => [String(row.id), row]),
  );
  const changed: Array<
    ReportingReference & {
      mode: string;
      currency_code: string;
      invalidation_token: string;
      created_at: Date;
      updated_at: Date;
    }
  > = [];
  for (const row of parsed) {
    const existing = existingById.get(row.id);
    if (
      existing &&
      (existing.seller_id !== row.seller_id ||
        existing.group_id !== row.group_id ||
        existing.cart_id !== row.cart_id ||
        existing.deleted_at)
    )
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The reporting order binding changed.",
      );
    if (
      existing &&
      existing.native_revision === row.native_revision &&
      existing.order_display_id === row.order_display_id &&
      existing.order_custom_display_id === row.order_custom_display_id
    )
      continue;
    changed.push({
      ...row,
      mode: "test",
      currency_code: "usd",
      invalidation_token: randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  if (changed.length) {
    const saved = await database(manager)("vendor_finance_reporting_projection")
      .insert(changed)
      .onConflict("id")
      .merge([
        "native_revision",
        "order_display_id",
        "order_custom_display_id",
        "invalidation_token",
        "updated_at",
      ])
      .whereRaw(
        `vendor_finance_reporting_projection.seller_id = excluded.seller_id
        and vendor_finance_reporting_projection.group_id = excluded.group_id
        and vendor_finance_reporting_projection.cart_id = excluded.cart_id
        and vendor_finance_reporting_projection.deleted_at is null`,
      )
      .returning("id");
    if (saved.length !== changed.length)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The reporting order binding changed during registration.",
      );
  }
}

export async function saveReportingDiscovery(
  manager: EntityManager,
  input: {
    references: ReportingReference[];
    expected: ReportingDiscovery;
    next: ReportingDiscovery;
  },
): Promise<boolean> {
  await database(manager)("commerce_scan")
    .insert({
      id: REPORTING_DISCOVERY_ID,
      position: JSON.stringify({ cursor: null, complete: false }),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflict("id")
    .ignore();
  await database(manager)("commerce_scan")
    .where({ id: REPORTING_DISCOVERY_ID })
    .forUpdate()
    .first();
  const current = await readReportingDiscovery(manager);
  if (
    current.cursor !== input.expected.cursor ||
    current.complete !== input.expected.complete
  )
    return false;
  await registerReportingReferences(manager, input.references);
  await database(manager)("commerce_scan")
    .where({ id: REPORTING_DISCOVERY_ID })
    .update({
      position: JSON.stringify(discoverySchema.parse(input.next)),
      updated_at: new Date(),
    });
  return true;
}

export async function invalidateReportingRegistry(
  manager: EntityManager,
  orderIds: string[],
): Promise<void> {
  const ids = z.array(z.string().startsWith("order_")).parse(orderIds).sort();
  if (!ids.length) return;
  // Snapshot fallback is also materialized here so invalidation cannot race the first refresh.
  const originals = await database(manager)("finance_sale_snapshot")
    .whereIn("id", ids)
    .whereNull("deleted_at")
    .orderBy("id")
    .select("id", "seller_id", "group_id", "cart_id");
  if (originals.length)
    await database(manager)("vendor_finance_reporting_projection")
      .insert(
        originals.map((row: Record<string, unknown>) => ({
          ...row,
          mode: "test",
          currency_code: "usd",
          created_at: new Date(),
          updated_at: new Date(),
        })),
      )
      .onConflict("id")
      .ignore();
  await database(manager)("vendor_finance_reporting_projection")
    .whereIn("id", ids)
    .orderBy("id")
    .forUpdate()
    .select("id");
  await database(manager)("vendor_finance_reporting_projection")
    .whereIn("id", ids)
    .update({ invalidation_token: randomUUID(), updated_at: new Date() });
}

export async function saveReportingGroupProjection(
  manager: EntityManager,
  input: {
    source: ReportingSource[];
    projections: Array<{ id: string; sources: unknown }>;
    refreshed_at: Date;
  },
): Promise<boolean> {
  const expected = reportingSourceSchema.array().parse(input.source);
  if (
    !expected.length ||
    expected.length !== input.projections.length ||
    new Set(input.projections.map((row) => row.id)).size !== expected.length
  )
    return false;
  const groupId = expected[0].group_id;
  if (expected.some((row) => row.group_id !== groupId)) return false;
  // Group → snapshots → projections matches financial journal and read-model lock order.
  await database(manager)("commerce_group_state")
    .where({ id: groupId })
    .forUpdate()
    .first();
  await database(manager)("finance_sale_snapshot")
    .where({ group_id: groupId })
    .orderBy("id")
    .forUpdate()
    .select("id");
  const originals = await database(manager)("finance_sale_snapshot")
    .where({ group_id: groupId })
    .whereNull("deleted_at")
    .select("id", "seller_id", "group_id", "cart_id");
  if (originals.length)
    await database(manager)("vendor_finance_reporting_projection")
      .insert(
        originals.map((row: Record<string, unknown>) => ({
          ...row,
          mode: "test",
          currency_code: "usd",
          created_at: new Date(),
          updated_at: new Date(),
        })),
      )
      .onConflict("id")
      .ignore();
  await database(manager)("vendor_finance_reporting_projection")
    .where({ group_id: groupId })
    .orderBy("id")
    .forUpdate()
    .select("id");
  const current = await readReportingGroupSource(manager, groupId);
  if (
    current.length !== expected.length ||
    current.some((row) => {
      const before = expected.find((part) => part.id === row.id);
      return (
        !before ||
        before.source_revision !== row.source_revision ||
        before.invalidation_token !== row.invalidation_token
      );
    })
  )
    return false;
  const projections = input.projections.map((projection) => {
    const row = current.find((source) => source.id === projection.id);
    if (!row)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The reporting order is missing.",
      );
    const sources = sellerReportingSourcesSchema.parse(projection.sources);
    if (
      sources.facts.some(
        (fact) =>
          fact.order_id !== row.id ||
          fact.seller_id !== row.seller_id ||
          fact.group_id !== row.group_id,
      ) ||
      sources.capture_allocations.some(
        (part) =>
          part.order_id !== row.id ||
          part.seller_id !== row.seller_id ||
          part.group_id !== row.group_id,
      ) ||
      sources.refund_adjustments.some(
        (part) => part.order_id !== row.id || part.seller_id !== row.seller_id,
      ) ||
      sources.coverage.issues.some((issue) => issue.resource !== row.id) ||
      sources.coverage.lists.length
    )
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Reporting evidence belongs to another seller order.",
      );
    return { id: projection.id, sources };
  });
  const columns = projections.map((projection) => {
    const row = current.find((source) => source.id === projection.id)!;
    return {
      id: row.id,
      seller_id: row.seller_id,
      group_id: row.group_id,
      cart_id: row.cart_id,
      mode: "test",
      currency_code: "usd",
      sources: JSON.stringify(projection.sources),
      source_revision: row.source_revision,
      evaluated_token: row.invalidation_token,
      refreshed_at: input.refreshed_at,
      updated_at: new Date(),
      created_at: new Date(),
    };
  });
  await database(manager)("vendor_finance_reporting_projection")
    .insert(columns)
    .onConflict("id")
    .merge([
      "sources",
      "source_revision",
      "evaluated_token",
      "refreshed_at",
      "updated_at",
    ]);
  return true;
}
