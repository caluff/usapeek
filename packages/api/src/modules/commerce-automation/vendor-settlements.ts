import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { z } from "@medusajs/framework/zod";
import { randomUUID } from "node:crypto";
import { parseISO } from "date-fns/parseISO";
import { isValid } from "date-fns/isValid";
import { paymentReleaseDelayDaysSchema } from "../../lib/order-finance/contracts";

const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (typeof value === "string" ? parseISO(value) : value))
  .refine(isValid);
const amount = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) =>
      Number.isSafeInteger(Math.round(value * 100)) &&
      Math.abs(Math.round(value * 100) / 100 - value) < 1e-8,
  );
export const settlementProjectionSchema = z.object({
  id: z.string().startsWith("order_"),
  seller_id: z.string().min(1),
  group_id: z.string().min(1),
  cart_id: z.string().min(1),
  data_kind: z.enum(["ordinary", "qa_fixture", "unknown"]),
  pending_amount: amount.nullable(),
  status: z.enum([
    "waiting",
    "processing",
    "needs_review",
    "released",
    "inactive",
  ]),
  projection: z.object({
    order_display_id: z.number().int().nullable(),
    order_custom_display_id: z.string().nullable(),
    reason: z.string().nullable(),
  }),
});
export type SettlementProjection = z.infer<typeof settlementProjectionSchema>;
export const settlementSourceRowSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  cart_id: z.string(),
  seller_id: z.string(),
  completed_at: instant,
  eligible_at: instant,
  release_delay_days: paymentReleaseDelayDaysSchema,
  observed_order_updated_at: instant,
  registration_token: z.string(),
  source_revision: z.string(),
  invalidation_token: z.string().nullable(),
});
export type SettlementSourceRow = z.infer<typeof settlementSourceRowSchema>;
export const registryReadInputSchema = z.object({
  seller_id: z.string().min(1),
  data_kind: z.enum(["ordinary", "qa_fixture"]),
  limit: z.number().int().min(1).max(50),
  offset: z.number().int().nonnegative().safe(),
  now: z.date(),
});
export type RegistryReadInput = z.infer<typeof registryReadInputSchema>;
const registryItemSchema = z.object({
  order_id: z.string(),
  order_display_id: z.number().int().nullable(),
  order_custom_display_id: z.string().nullable(),
  pending_amount: amount.nullable(),
  status: z.enum(["waiting", "processing", "needs_review"]),
  completed_at: instant,
  eligible_at: instant,
  reason: z.string().nullable(),
  updated_at: instant.nullable(),
});
const registryResultSchema = z.object({
  items: z.array(registryItemSchema),
  count: z.coerce.number().int().nonnegative(),
  total_pending: z.coerce.number().finite().nonnegative().nullable(),
  next_release_at: instant.nullable(),
  unknown_amount_count: z.coerce.number().int().nonnegative(),
});
export type RegistryReadResult = z.infer<typeof registryResultSchema>;

// Operations can finish without updating group state; facts also change independently.
// Compare every local journal revision, rather than treating the largest timestamp as a version.
const SOURCE_REVISION_SQL = `md5(concat_ws('|', c.updated_at::text, c.registration_token, c.observed_order_updated_at::text, c.release_delay_days::text,
  s.updated_at::text, s.cart_id, s.active_token, s.review_required::text, s.observation::text,
  (select string_agg(o.id || ':' || o.state || ':' || o.updated_at::text || ':' || coalesce(o.result::text, ''), '|' order by o.id)
    from commerce_operation o where o.group_id = c.group_id and o.deleted_at is null),
  (select string_agg(f.id || ':' || f.updated_at::text || ':' || f.fact::text, '|' order by f.id)
    from finance_provider_fact f where f.group_id = c.group_id and f.deleted_at is null)))`;
const SOURCE_SCOPE_SQL = `select c.*, p.invalidation_token,
  ${SOURCE_REVISION_SQL} as current_source_revision,
  p.source_revision, p.evaluated_token, p.refreshed_at, p.pending_amount::numeric as pending_amount,
  p.status as projection_status, coalesce(p.data_kind, 'unknown') as data_kind,
  coalesce(p.projection, '{}'::jsonb) as projection,
  (p.source_revision = ${SOURCE_REVISION_SQL}
    and p.invalidation_token is not distinct from p.evaluated_token
    and (p.status in ('released', 'inactive') or p.refreshed_at > ?::timestamptz - interval '10 minutes')
    and s.id is not null and s.cart_id = c.cart_id
    and (p.status <> 'waiting' or (s.active_token is null and not s.review_required
      and (s.observation->'finance_execution_writers' is null
        or s.observation->'finance_execution_writers' = '[]'::jsonb)))) as is_fresh
  from order_completion c
  left join vendor_settlement_projection p on p.id = c.id
    and p.seller_id = c.seller_id and p.group_id = c.group_id and p.cart_id = c.cart_id and p.deleted_at is null
  left join commerce_group_state s on s.id = c.group_id and s.deleted_at is null
  where c.deleted_at is null`;

function database(manager: EntityManager) {
  return manager.getTransactionContext() ?? manager.getKnex();
}

export async function readSettlementRegistry(
  manager: EntityManager,
  input: RegistryReadInput,
): Promise<RegistryReadResult> {
  const parsed = registryReadInputSchema.parse(input);
  const result = await database(manager).raw(
    `with scoped as (${SOURCE_SCOPE_SQL}
    and c.seller_id = ?), effective as (
    select *, case when is_fresh then pending_amount else null end as effective_amount,
      case when is_fresh then projection_status else 'needs_review' end as effective_status
    from scoped where data_kind in (?, 'unknown')), visible as (
    select * from effective where effective_status not in ('released', 'inactive')
  ), summary as (
    select count(*) as count, count(*) filter(where effective_amount is null) as unknown_amount_count,
      case when count(*) filter(where effective_amount is null) > 0 then null
        else coalesce(sum(round((effective_amount * 100)::numeric)) / 100, 0) end as total_pending,
      min(eligible_at) filter(where effective_status = 'waiting' and effective_amount > 0) as next_release_at
    from visible
  ), page as (
    select id as order_id, (projection->>'order_display_id')::integer as order_display_id,
      projection->>'order_custom_display_id' as order_custom_display_id,
      effective_amount as pending_amount, effective_status as status, completed_at, eligible_at,
      case when is_fresh then projection->>'reason'
        else 'El importe pendiente se está verificando. Actualiza en unos minutos.' end as reason,
      refreshed_at as updated_at
    from visible order by eligible_at, id limit ? offset ?
  ) select summary.*, coalesce((select jsonb_agg(page order by eligible_at, order_id) from page), '[]'::jsonb) as items from summary`,
    [
      parsed.now,
      parsed.seller_id,
      parsed.data_kind,
      parsed.limit,
      parsed.offset,
    ],
  );
  return registryResultSchema.parse(result.rows[0]);
}

export async function listDirtySettlementGroups(
  manager: EntityManager,
  take: number,
  now: Date,
): Promise<string[]> {
  const result = await database(manager).raw(
    `with scoped as (${SOURCE_SCOPE_SQL})
    select group_id from scoped where not coalesce(is_fresh, false)
    group by group_id order by min(coalesce(refreshed_at, completed_at)), group_id limit ?`,
    [now, take],
  );
  return z
    .array(z.object({ group_id: z.string() }))
    .parse(result.rows)
    .map((row) => row.group_id);
}

export async function readSettlementGroupSource(
  manager: EntityManager,
  groupId: string,
): Promise<SettlementSourceRow[]> {
  const result = await database(manager).raw(
    `with scoped as (${SOURCE_SCOPE_SQL} and c.group_id = ?)
    select id, group_id, cart_id, seller_id, release_delay_days,
      to_json(completed_at) #>> '{}' as completed_at,
      to_json(eligible_at) #>> '{}' as eligible_at,
      to_json(observed_order_updated_at) #>> '{}' as observed_order_updated_at,
      registration_token, current_source_revision as source_revision, invalidation_token
    from scoped order by id`,
    [new Date(), groupId],
  );
  return settlementSourceRowSchema.array().parse(result.rows);
}

export async function invalidateSettlementRegistry(
  manager: EntityManager,
  orderIds: string[],
): Promise<void> {
  const ids = z.array(z.string().startsWith("order_")).parse(orderIds);
  if (!ids.length) return;
  const result = await database(manager)("order_completion")
    .whereIn("id", ids)
    .whereNull("deleted_at")
    .orderBy("id")
    .forUpdate()
    .select("id", "seller_id", "group_id", "cart_id");
  for (const row of result) {
    const token = randomUUID();
    await database(manager)("vendor_settlement_projection")
      .insert({
        ...row,
        mode: "test",
        currency_code: "usd",
        data_kind: "unknown",
        status: "needs_review",
        pending_amount: null,
        projection: {},
        invalidation_token: token,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict("id")
      .merge({ invalidation_token: token, updated_at: new Date() });
  }
}

export async function saveSettlementGroupProjection(
  manager: EntityManager,
  input: {
    source: SettlementSourceRow[];
    projections: SettlementProjection[];
    refreshed_at: Date;
  },
): Promise<boolean> {
  const expected = settlementSourceRowSchema.array().parse(input.source);
  const projections = settlementProjectionSchema
    .array()
    .parse(input.projections);
  if (
    !expected.length ||
    projections.length !== expected.length ||
    new Set(projections.map((row) => row.id)).size !== projections.length
  )
    return false;
  const groupId = expected[0].group_id;
  if (expected.some((row) => row.group_id !== groupId)) return false;
  await database(manager)("commerce_group_state")
    .where({ id: groupId })
    .whereNull("deleted_at")
    .forUpdate()
    .first();
  await database(manager)("order_completion")
    .where({ group_id: groupId })
    .whereNull("deleted_at")
    .orderBy("id")
    .forUpdate()
    .select("id");
  await database(manager)("vendor_settlement_projection")
    .where({ group_id: groupId })
    .whereNull("deleted_at")
    .orderBy("id")
    .forUpdate()
    .select("id");
  const current = await readSettlementGroupSource(manager, groupId);
  if (
    current.length !== expected.length ||
    current.some((row) => {
      const prior = expected.find((part) => part.id === row.id);
      return (
        !prior ||
        prior.source_revision !== row.source_revision ||
        prior.invalidation_token !== row.invalidation_token ||
        prior.registration_token !== row.registration_token ||
        prior.seller_id !== row.seller_id ||
        prior.cart_id !== row.cart_id ||
        prior.group_id !== row.group_id ||
        prior.completed_at.getTime() !== row.completed_at.getTime() ||
        prior.eligible_at.getTime() !== row.eligible_at.getTime() ||
        prior.release_delay_days !== row.release_delay_days ||
        prior.observed_order_updated_at.getTime() !==
          row.observed_order_updated_at.getTime()
      );
    })
  )
    return false;
  for (const projection of projections) {
    const source = current.find((row) => row.id === projection.id);
    if (
      !source ||
      source.seller_id !== projection.seller_id ||
      source.cart_id !== projection.cart_id ||
      source.group_id !== projection.group_id
    )
      return false;
  }
  for (const projection of projections) {
    const source = current.find((row) => row.id === projection.id)!;
    const existing = await database(manager)("vendor_settlement_projection")
      .where({ id: projection.id })
      .whereNull("deleted_at")
      .select("data_kind")
      .first();
    const columns = {
      ...projection,
      data_kind:
        projection.data_kind === "unknown" &&
        ["ordinary", "qa_fixture"].includes(existing?.data_kind)
          ? existing.data_kind
          : projection.data_kind,
      pending_amount:
        projection.pending_amount === null
          ? null
          : projection.pending_amount.toFixed(2),
      projection: JSON.stringify(projection.projection),
      mode: "test",
      currency_code: "usd",
      source_revision: source.source_revision,
      evaluated_token: source.invalidation_token,
      invalidation_token: source.invalidation_token,
      refreshed_at: input.refreshed_at,
      updated_at: new Date(),
    };
    await database(manager)("vendor_settlement_projection")
      .insert({ ...columns, created_at: new Date() })
      .onConflict("id")
      .merge(columns);
  }
  return true;
}
