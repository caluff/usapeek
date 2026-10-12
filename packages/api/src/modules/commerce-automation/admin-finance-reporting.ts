import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { adminReportingSourcesSchema } from "../../lib/order-finance/reporting-sources";
import { REPORTING_DISCOVERY_ID } from "./vendor-finance-reporting";

export const ADMIN_REPORTING_FORMAT_VERSION = 1;
export const MAX_ADMIN_REPORTING_GROUPS = 2_000;
const referenceSchema = z.object({
  id: z.string().startsWith("order_"),
  seller_id: z.string().min(1),
  native_revision: z.string().nullable(),
  order_display_id: z.number().int().nullable(),
  order_custom_display_id: z.string().nullable(),
});
export const adminReportingSourceSchema = z.object({
  id: z.string().min(1),
  cart_id: z.string().min(1),
  references: z.array(referenceSchema).min(1).max(2_000),
  source_revision: z.string().min(1),
  invalidation_token: z.string().nullable(),
  unsafe: z.boolean(),
});
export type AdminReportingSource = z.infer<typeof adminReportingSourceSchema>;
const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));
const readRowSchema = adminReportingSourceSchema.extend({
  is_fresh: z.boolean(),
  refreshed_at: instant.nullable(),
  sources: z.unknown().nullable(),
});
export type AdminReportingReadRow = z.infer<typeof readRowSchema>;
const discoverySchema = z.object({
  cursor: z.string().nullable(),
  complete: z.boolean(),
});

function database(manager: EntityManager) {
  return manager.getTransactionContext() ?? manager.getKnex();
}

// The private seller registry already discovers native identities. Keep its
// snapshot fallback so unprepared/historical groups cannot disappear as zeros.
const REFERENCES_SQL = `select p.id, p.seller_id, p.group_id, p.cart_id, p.native_revision,
  p.order_display_id, p.order_custom_display_id, p.invalidation_token
  from vendor_finance_reporting_projection p where p.deleted_at is null
  union all select a.id, a.seller_id, a.group_id, a.cart_id, null::text,
  null::integer, null::text, null::text from finance_sale_snapshot a where a.deleted_at is null
  and not exists (select 1 from vendor_finance_reporting_projection p where p.id = a.id and p.deleted_at is null)`;
const COST_KEY_SQL = `'stripe:' || (f.fact->>'mode') || ':' || (f.fact->>'account_id') || ':balance_transaction:' || (f.fact->>'balance_transaction_id')`;

// Include semantic contents, not timestamps alone. A missing, inserted or
// deleted referenced fee is part of the revision even without a PubSub event.
const SOURCE_SQL = `with refs as (${REFERENCES_SQL}), grouped as (
  select group_id as id, min(cart_id) as cart_id, count(distinct cart_id) > 1 as binding_unsafe,
  jsonb_agg(jsonb_build_object('id', id, 'seller_id', seller_id, 'native_revision', native_revision,
    'order_display_id', order_display_id, 'order_custom_display_id', order_custom_display_id) order by id) as "references",
  md5(coalesce(jsonb_agg(jsonb_build_object('id', id, 'cart_id', cart_id, 'token', invalidation_token) order by id)::text, '')) as invalidation_token
  from refs group by group_id
), current as (
  select g.*, md5(concat_ws('|', '${ADMIN_REPORTING_FORMAT_VERSION}', g.id, g.cart_id, g."references"::text, g.invalidation_token,
    to_jsonb(s)::text,
    (select jsonb_agg(to_jsonb(a) order by a.id)::text from finance_sale_snapshot a where a.group_id = g.id),
    (select jsonb_agg(to_jsonb(o) order by o.id)::text from commerce_operation o where o.group_id = g.id),
    (select jsonb_agg(to_jsonb(f) order by f.id)::text from finance_provider_fact f where f.group_id = g.id),
    (select jsonb_agg(jsonb_build_object('key', k.id, 'cost', to_jsonb(c)) order by k.id)::text
      from (select distinct ${COST_KEY_SQL} as id from finance_provider_fact f
        where f.group_id = g.id and f.deleted_at is null and f.fact->>'balance_transaction_id' is not null) k
      left join finance_provider_cost c on c.id = k.id))) as source_revision,
    (g.binding_unsafe or coalesce(s.cart_id <> g.cart_id or s.active_token is not null or s.review_required
      or (s.observation->'finance_execution_writers' is not null and s.observation->'finance_execution_writers' <> '[]'::jsonb), false)
      or exists (select 1 from finance_sale_snapshot a where a.group_id = g.id and a.deleted_at is null
        and not exists (select 1 from refs r where r.group_id = a.group_id and r.id = a.id and r.seller_id = a.seller_id and r.cart_id = a.cart_id))) as unsafe
  from grouped g left join commerce_group_state s on s.id = g.id and s.deleted_at is null
)`;
const READ_SQL = `${SOURCE_SQL} select c.id, c.cart_id, c."references", c.source_revision, c.invalidation_token, c.unsafe,
  coalesce(p.format_version = ${ADMIN_REPORTING_FORMAT_VERSION} and p.cart_id = c.cart_id and p.source_revision = c.source_revision
    and p.invalidation_token is not distinct from c.invalidation_token and p.sources is not null, false) as is_fresh,
  p.refreshed_at, p.sources from current c left join admin_finance_reporting_projection p on p.id = c.id and p.deleted_at is null`;

export async function readAdminReportingRegistry(
  manager: EntityManager,
): Promise<{
  rows: AdminReportingReadRow[];
  discovery: z.infer<typeof discoverySchema>;
  truncated: boolean;
}> {
  const result = await database(manager).raw(
    `with registry as (${READ_SQL}), page as (
    select * from registry order by id limit ?)
    select coalesce((select jsonb_agg(page order by id) from page), '[]'::jsonb) as rows,
    (select position from commerce_scan where id = ? and deleted_at is null) as discovery`,
    [MAX_ADMIN_REPORTING_GROUPS + 1, REPORTING_DISCOVERY_ID],
  );
  const rows = readRowSchema.array().parse(result.rows[0].rows);
  return {
    rows: rows.slice(0, MAX_ADMIN_REPORTING_GROUPS),
    truncated: rows.length > MAX_ADMIN_REPORTING_GROUPS,
    discovery: result.rows[0].discovery
      ? discoverySchema.parse(JSON.parse(result.rows[0].discovery))
      : { cursor: null, complete: false },
  };
}

export async function readAdminReportingGroupSource(
  manager: EntityManager,
  groupId: string,
): Promise<AdminReportingSource | null> {
  const result = await database(manager).raw(
    `${SOURCE_SQL} select * from current where id = ?`,
    [z.string().min(1).parse(groupId)],
  );
  return result.rows.length
    ? adminReportingSourceSchema.parse(result.rows[0])
    : null;
}

export async function listDirtyAdminReportingGroups(
  manager: EntityManager,
  now: Date,
): Promise<string[]> {
  const result = await database(manager).raw(
    `select id from (${READ_SQL}) registry
    where not is_fresh or refreshed_at < ?::timestamptz - interval '10 minutes'
    order by is_fresh, coalesce(refreshed_at, '1970-01-01'::timestamptz), id limit 1`,
    [now],
  );
  return z
    .array(z.object({ id: z.string() }))
    .parse(result.rows)
    .map((row) => row.id);
}

export function ownedAdminReportingSources(
  value: unknown,
  source: AdminReportingSource,
) {
  const sources = adminReportingSourcesSchema.parse(value);
  const references = new Map(source.references.map((row) => [row.id, row]));
  const owned = (order: string, seller: string) =>
    references.get(order)?.seller_id === seller;
  const costKeys = new Set(
    sources.facts.flatMap((fact) =>
      fact.balance_transaction_id
        ? [
            `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`,
          ]
        : [],
    ),
  );
  if (
    references.size !== source.references.length ||
    sources.facts.some(
      (fact) =>
        fact.group_id !== source.id ||
        (fact.order_id !== null &&
          (!references.has(fact.order_id) ||
            (fact.seller_id !== null &&
              !owned(fact.order_id, fact.seller_id)))) ||
        (fact.seller_id !== null &&
          !source.references.some((row) => row.seller_id === fact.seller_id)),
    ) ||
    sources.capture_allocations.some(
      (part) =>
        part.group_id !== source.id ||
        !owned(part.order_id, part.seller_id) ||
        (part.original !== null &&
          (part.original.cart_id !== source.cart_id ||
            part.original.group_id !== source.id ||
            part.original.order_id !== part.order_id ||
            part.original.seller_id !== part.seller_id)),
    ) ||
    sources.refund_adjustments.some(
      (part) => !owned(part.order_id, part.seller_id),
    ) ||
    sources.costs.some(
      (cost) =>
        cost.key !==
          `stripe:${cost.mode}:${cost.account_id}:balance_transaction:${cost.balance_transaction_id}` ||
        !costKeys.has(cost.key),
    ) ||
    (sources.observation && sources.observation.group_id !== source.id) ||
    (sources.coverage.complete &&
      (sources.coverage.issues.length ||
        sources.coverage.lists.some((list) => !list.complete) ||
        [...costKeys].some(
          (key) => !sources.costs.some((cost) => cost.key === key),
        ) ||
        sources.capture_allocations.length !== references.size ||
        source.references.some(
          (row) =>
            !sources.capture_allocations.some(
              (part) => part.order_id === row.id,
            ),
        )))
  )
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Admin reporting evidence does not cover its native group.",
    );
  for (const keys of [
    sources.facts.map((row) => row.key),
    sources.costs.map((row) => row.key),
    sources.capture_allocations.map((row) => row.order_id),
    sources.refund_adjustments.map(
      (row) => `${row.fact_key}:${row.operation_id}`,
    ),
  ])
    if (new Set(keys).size !== keys.length)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Admin reporting evidence contains duplicate sources.",
      );
  return sources;
}

/** Caller owns one committed transaction shared with the seller projections. */
export async function saveAdminReportingProjection(
  manager: EntityManager,
  input: {
    source: AdminReportingSource;
    sources: unknown;
    refreshed_at: Date;
  },
): Promise<boolean> {
  const expected = adminReportingSourceSchema.parse(input.source);
  const sources = ownedAdminReportingSources(input.sources, expected);
  await database(manager)("commerce_group_state")
    .where({ id: expected.id })
    .forUpdate()
    .first();
  await database(manager)("finance_sale_snapshot")
    .where({ group_id: expected.id })
    .orderBy("id")
    .forUpdate()
    .select("id");
  await database(manager)("vendor_finance_reporting_projection")
    .where({ group_id: expected.id })
    .orderBy("id")
    .forUpdate()
    .select("id");
  await database(manager)("finance_provider_fact")
    .where({ group_id: expected.id })
    .orderBy("id")
    .forUpdate()
    .select("id");
  const keys = [
    ...new Set(
      sources.facts.flatMap((fact) =>
        fact.balance_transaction_id
          ? [
              `stripe:${fact.mode}:${fact.account_id}:balance_transaction:${fact.balance_transaction_id}`,
            ]
          : [],
      ),
    ),
  ].sort();
  if (keys.length)
    await database(manager)("finance_provider_cost")
      .whereIn("id", keys)
      .orderBy("id")
      .forUpdate()
      .select("id");
  const current = await readAdminReportingGroupSource(manager, expected.id);
  if (
    !current ||
    current.source_revision !== expected.source_revision ||
    current.invalidation_token !== expected.invalidation_token ||
    current.cart_id !== expected.cart_id ||
    JSON.stringify(current.references) !==
      JSON.stringify(expected.references) ||
    current.unsafe !== expected.unsafe
  )
    return false;
  await database(manager)("admin_finance_reporting_projection")
    .insert({
      id: expected.id,
      cart_id: expected.cart_id,
      format_version: ADMIN_REPORTING_FORMAT_VERSION,
      source_revision: expected.source_revision,
      invalidation_token: expected.invalidation_token,
      sources: JSON.stringify(sources),
      refreshed_at: input.refreshed_at,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflict("id")
    .merge([
      "cart_id",
      "format_version",
      "source_revision",
      "invalidation_token",
      "sources",
      "refreshed_at",
      "updated_at",
    ]);
  return true;
}
