import {
  isStripeLivemode,
  stripeModeSchema,
  type StripeMode,
} from "../stripe-mode";
import { isDeepStrictEqual } from "node:util";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { fromUnixTime } from "date-fns/fromUnixTime";
import { parseISO } from "date-fns/parseISO";
import type Stripe from "stripe";

const id = z.string().min(1);
const instant = z.iso.datetime({ offset: true });
const minor = z.number().int().safe();
const kind = z.enum([
  "capture",
  "refund",
  "transfer",
  "reversal",
  "authorization_release",
]);
const dataKind = z.enum(["ordinary", "qa_fixture", "unknown"]);

// These are provider-boundary amounts, not Medusa display-unit amounts.
export const providerFinanceFactSchema = z.object({
  key: id,
  kind,
  provider: z.literal("stripe"),
  mode: stripeModeSchema,
  account_id: id,
  group_id: id,
  operation_id: id.nullable(),
  order_id: id.nullable(),
  seller_id: id.nullable(),
  native_id: id.nullable(),
  provider_id: id,
  charge_id: id,
  payment_intent_id: id.nullable(),
  transfer_id: id.nullable(),
  destination_account_id: id.nullable(),
  provider_operation_id: id.nullable(),
  provider_order_id: id.nullable(),
  provider_seller_id: id.nullable().default(null),
  provider_transfer_group: id.nullable().default(null),
  amount_minor: minor.nonnegative(),
  currency_code: z.literal("usd"),
  data_kind: dataKind,
  component_attribution: z.literal("unallocated"),
  effect_status: z.enum(["confirmed", "pending", "failed"]),
  reconciliation_status: z.enum(["matched", "unattributed", "conflict"]),
  effective_at: instant.nullable(),
  effective_source: z.enum([
    "stripe_event_created",
    "stripe_object_created",
    "unknown",
  ]),
  provider_event_id: id.nullable(),
  provider_created_at: instant,
  balance_transaction_id: id.nullable(),
  recorded_at: instant,
  reconciled_at: instant.nullable(),
});
export type ProviderFinanceFact = z.infer<typeof providerFinanceFactSchema>;

export const providerFinanceCostSchema = z
  .object({
    key: id,
    provider: z.literal("stripe"),
    mode: stripeModeSchema,
    account_id: id,
    balance_transaction_id: id,
    source_id: id.nullable(),
    status: z.enum(["pending", "confirmed", "unavailable"]),
    currency_code: z.literal("usd"),
    amount_minor: minor.nullable(),
    fee_minor: minor.nullable(),
    net_minor: minor.nullable(),
    fee_details: z
      .array(
        z.object({
          amount_minor: minor,
          currency_code: z.literal("usd"),
          type: z.string(),
          description: z.string().nullable(),
          application: z.string().nullable(),
        }),
      )
      .nullable(),
    provider_created_at: instant.nullable(),
    available_at: instant.nullable(),
    recorded_at: instant,
    reconciled_at: instant.nullable(),
    allocation: z.literal("platform_unallocated"),
  })
  .superRefine((cost, context) => {
    const complete =
      cost.amount_minor !== null &&
      cost.fee_minor !== null &&
      cost.net_minor !== null &&
      cost.fee_details !== null &&
      cost.provider_created_at !== null &&
      cost.source_id !== null &&
      cost.reconciled_at !== null;
    if (
      cost.status === "confirmed"
        ? !complete || cost.net_minor !== cost.amount_minor! - cost.fee_minor!
        : cost.fee_minor !== null ||
          cost.net_minor !== null ||
          cost.fee_details !== null ||
          cost.reconciled_at !== null
    )
      context.addIssue({
        code: "custom",
        message: "Only confirmed costs have verified fees and net amounts",
      });
  });
export type ProviderFinanceCost = z.infer<typeof providerFinanceCostSchema>;

const attributionSchema = z.object({
  kind,
  provider_id: id,
  operation_id: id.nullable(),
  native_id: id.nullable(),
  order_id: id.nullable(),
  seller_id: id.nullable(),
  amount_minor: minor.nonnegative(),
  data_kind: dataKind,
});
export type ProviderFactAttribution = z.infer<typeof attributionSchema>;

const observationInputSchema = z.object({
  mode: stripeModeSchema.default("test"),
  account_id: id,
  group_id: id,
  charge_id: id,
  orders: z
    .array(
      z.object({
        order_id: id,
        seller_id: id,
        destination_account_id: id.nullable(),
      }),
    )
    .max(50),
  attributions: z.array(attributionSchema).default([]),
  // Only release IDs already verified by the final-capture journal belong here.
  authorization_release_refund_ids: z.array(id).default([]),
  recorded_at: instant,
  max_pages: z.number().int().min(1).max(1000).default(100),
});
export type ProviderFactsInput = z.input<typeof observationInputSchema>;

export type StripeFinanceReader = {
  accounts: Pick<Stripe["accounts"], "retrieveCurrent">;
  balance: Pick<Stripe["balance"], "retrieve">;
  charges: Pick<Stripe["charges"], "retrieve">;
  refunds: Pick<Stripe["refunds"], "list">;
  transfers: Pick<Stripe["transfers"], "list" | "listReversals">;
  events: Pick<Stripe["events"], "list">;
  balanceTransactions: Pick<Stripe["balanceTransactions"], "retrieve">;
};

export const providerFactCoverageSchema = z.object({
  complete: z.boolean(),
  issues: z.array(z.object({ resource: id, reason: id })),
  lists: z.array(
    z.object({
      resource: id,
      pages: z.number().int().nonnegative(),
      complete: z.boolean(),
    }),
  ),
  // A complete events listing only covers Stripe's retained 30-day window.
  capture_events_scope: z.literal("stripe_retained_events_30_days"),
});
export type ProviderFactCoverage = z.infer<typeof providerFactCoverageSchema>;
export const providerFinanceObservationMetadataSchema = z.object({
  group_id: id,
  observed_at: instant,
  reporting_context: z.object({
    payment_intent_id: id,
    amount_received_minor: minor.nonnegative(),
    status: z.enum([
      "canceled",
      "processing",
      "requires_action",
      "requires_capture",
      "requires_confirmation",
      "requires_payment_method",
      "succeeded",
    ]),
    finance_data_kind: dataKind,
    capture_operation_id: id.nullable(),
    charge_id: id.nullable(),
    operation_revisions: z
      .array(
        z.object({
          operation_id: id,
          updated_at: instant,
          state: z.enum(["processing", "uncertain", "complete"]),
        }),
      )
      .optional(),
  }),
});
export const providerFinanceObservationSchema =
  providerFinanceObservationMetadataSchema.extend({
    coverage: providerFactCoverageSchema,
  });
export type ProviderFinanceObservationMetadata = z.infer<
  typeof providerFinanceObservationMetadataSchema
>;
export type ProviderFactsObservation = {
  facts: ProviderFinanceFact[];
  costs: ProviderFinanceCost[];
  coverage: ProviderFactCoverage;
  observation?: ProviderFinanceObservationMetadata;
};

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function timestamp(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 0)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Invalid Stripe timestamp",
    );
  return fromUnixTime(seconds).toISOString();
}

function uniqueKey(
  mode: StripeMode,
  account: string,
  type: string,
  providerId: string,
) {
  return `stripe:${mode}:${account}:${type === "authorization_release" ? "refund" : type}:${providerId}`;
}

/** Reads every page, preserving an explicit incomplete result on limits/errors. */
export async function readStripeFactPages<T extends { id: string }>(
  read: (
    cursor: string | undefined,
  ) => PromiseLike<Pick<Stripe.ApiList<T>, "data" | "has_more">>,
  maxPages: number,
) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Invalid Stripe pagination limit",
    );
  const rows = new Map<string, T>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  let reason: string | null = "page_limit";
  for (; pages < maxPages;) {
    let page: Pick<Stripe.ApiList<T>, "data" | "has_more">;
    try {
      page = await read(cursor);
    } catch {
      reason = "read_failed";
      break;
    }
    pages++;
    for (const row of page.data) {
      const previous = rows.get(row.id);
      if (previous && !isDeepStrictEqual(previous, row))
        return {
          data: [...rows.values()],
          pages,
          complete: false,
          reason: "conflicting_duplicate",
        };
      rows.set(row.id, row);
    }
    if (!page.has_more) {
      reason = null;
      break;
    }
    cursor = page.data[page.data.length - 1]?.id;
    if (!cursor || cursors.has(cursor)) {
      reason = "invalid_cursor";
      break;
    }
    cursors.add(cursor);
  }
  return { data: [...rows.values()], pages, complete: reason === null, reason };
}

/** Only GET/list capabilities are accepted; this function never performs recovery. */
export async function observeStripeFinanceFacts(
  stripe: StripeFinanceReader,
  rawInput: ProviderFactsInput,
): Promise<ProviderFactsObservation> {
  const input = observationInputSchema.parse(rawInput);
  if (
    new Set(input.orders.map((order) => order.order_id)).size !==
    input.orders.length
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Duplicate order scope",
    );
  const [account, balance] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.balance.retrieve(),
  ]);
  if (
    account.id !== input.account_id ||
    !isStripeLivemode(balance.livemode, input.mode)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Finance observation requires the expected Stripe account and mode",
    );
  const charge = await stripe.charges.retrieve(input.charge_id);
  if (
    charge.id !== input.charge_id ||
    !isStripeLivemode(charge.livemode, input.mode) ||
    charge.currency !== "usd"
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Finance observation requires a matching USD charge and mode",
    );
  minor.nonnegative().parse(charge.amount);
  minor.nonnegative().parse(charge.amount_captured);
  if (charge.amount_captured > charge.amount)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Invalid captured Stripe amount",
    );
  const coverage: ProviderFactCoverage = {
    complete: true,
    issues: [],
    lists: [],
    capture_events_scope: "stripe_retained_events_30_days",
  };
  const issue = (resource: string, reason: string) => {
    coverage.complete = false;
    coverage.issues.push({ resource, reason });
  };
  if (!input.orders.length) issue(input.group_id, "order_scope_missing");
  async function list<T extends { id: string }>(
    resource: string,
    read: (
      cursor: string | undefined,
    ) => PromiseLike<Pick<Stripe.ApiList<T>, "data" | "has_more">>,
  ) {
    const result = await readStripeFactPages(read, input.max_pages);
    coverage.lists.push({
      resource,
      pages: result.pages,
      complete: result.complete,
    });
    if (result.reason) issue(resource, result.reason);
    return result;
  }
  const facts: ProviderFinanceFact[] = [];
  const usedAttributions = new Set<ProviderFactAttribution>();
  function addFact(
    type: ProviderFinanceFact["kind"],
    movement: {
      id: string;
      amount: number;
      created: number;
      balance_transaction: string | Stripe.BalanceTransaction | null;
      metadata?: Stripe.Metadata | null;
    },
    extra: Partial<ProviderFinanceFact> = {},
    hasConflict = false,
  ) {
    const matches = input.attributions.filter(
      (entry) => entry.kind === type && entry.provider_id === movement.id,
    );
    matches.forEach((entry) => usedAttributions.add(entry));
    const attribution = matches.length === 1 ? matches[0] : null;
    const order = input.orders.find(
      (entry) => entry.order_id === attribution?.order_id,
    );
    const metadata = movement.metadata;
    const conflict =
      hasConflict ||
      matches.length > 1 ||
      Boolean(
        attribution &&
        (attribution.amount_minor !== movement.amount ||
          (type === "capture"
            ? attribution.order_id !== null || attribution.seller_id !== null
            : !order || order.seller_id !== attribution.seller_id) ||
          (metadata?.finance_operation_id &&
            metadata.finance_operation_id !== attribution.operation_id) ||
          (metadata?.order_id && metadata.order_id !== attribution.order_id) ||
          (metadata?.seller_id &&
            metadata.seller_id !== attribution.seller_id) ||
          (extra.destination_account_id &&
            order?.destination_account_id !== extra.destination_account_id)),
      );
    const reconciliation = conflict
      ? "conflict"
      : attribution
        ? "matched"
        : "unattributed";
    const fact = providerFinanceFactSchema.parse({
      key: uniqueKey(input.mode, input.account_id, type, movement.id),
      kind: type,
      provider: "stripe",
      mode: input.mode,
      account_id: input.account_id,
      group_id: input.group_id,
      operation_id: !conflict ? (attribution?.operation_id ?? null) : null,
      order_id: !conflict ? (attribution?.order_id ?? null) : null,
      seller_id: !conflict ? (attribution?.seller_id ?? null) : null,
      native_id: !conflict ? (attribution?.native_id ?? null) : null,
      provider_id: movement.id,
      charge_id: charge.id,
      payment_intent_id: objectId(charge.payment_intent),
      transfer_id: null,
      destination_account_id: null,
      provider_operation_id: metadata?.finance_operation_id || null,
      provider_order_id: metadata?.order_id || null,
      provider_seller_id: metadata?.seller_id || null,
      provider_transfer_group: null,
      amount_minor: movement.amount,
      currency_code: "usd",
      data_kind: !conflict ? (attribution?.data_kind ?? "unknown") : "unknown",
      component_attribution: "unallocated",
      effect_status: "confirmed",
      effective_at: timestamp(movement.created),
      effective_source: "stripe_object_created",
      provider_event_id: null,
      provider_created_at: timestamp(movement.created),
      balance_transaction_id: objectId(movement.balance_transaction),
      recorded_at: input.recorded_at,
      ...extra,
      reconciliation_status: reconciliation,
      reconciled_at: reconciliation === "matched" ? input.recorded_at : null,
    });
    if (fact.effect_status !== "confirmed" || fact.effective_at === null)
      fact.reconciled_at = null;
    if (reconciliation !== "matched") issue(fact.key, reconciliation);
    if (fact.data_kind === "unknown") issue(fact.key, "data_kind_unknown");
    if (fact.effect_status !== "confirmed")
      issue(fact.key, `effect_${fact.effect_status}`);
    const previous = facts.find((entry) => entry.key === fact.key);
    if (previous) {
      if (!isDeepStrictEqual(previous, fact)) {
        issue(fact.key, "conflicting_duplicate");
        previous.reconciliation_status = "conflict";
        previous.operation_id = null;
        previous.order_id = null;
        previous.seller_id = null;
        previous.native_id = null;
        previous.data_kind = "unknown";
        previous.reconciled_at = null;
      }
    } else facts.push(fact);
  }

  if (charge.amount_captured > 0) {
    const events = await list("capture_events", (cursor) =>
      stripe.events.list({
        type: "charge.captured",
        created: { gte: charge.created },
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    const candidates = events.data.filter(
      (event) =>
        event.type === "charge.captured" &&
        event.data.object.object === "charge" &&
        event.data.object.id === charge.id,
    );
    const event = candidates.length === 1 ? candidates[0] : null;
    const object = event?.data.object;
    const matched =
      events.complete &&
      event &&
      object?.object === "charge" &&
      isStripeLivemode(event.livemode, input.mode) &&
      (!event.account || event.account === input.account_id) &&
      isStripeLivemode(object.livemode, input.mode) &&
      object.currency === "usd" &&
      object.captured &&
      object.paid &&
      object.amount_captured === charge.amount_captured &&
      objectId(object.payment_intent) === objectId(charge.payment_intent) &&
      event.created >= charge.created &&
      event.created * 1000 <= parseISO(input.recorded_at).getTime();
    if (!matched)
      issue(
        charge.id,
        candidates.length > 1
          ? "capture_event_ambiguous"
          : "capture_time_unverified",
      );
    addFact(
      "capture",
      { ...charge, amount: charge.amount_captured },
      {
        effective_at: matched ? timestamp(event.created) : null,
        effective_source: matched ? "stripe_event_created" : "unknown",
        provider_event_id: matched ? event.id : null,
      },
      !charge.captured || !charge.paid,
    );
  }

  const refunds = await list("refunds", (cursor) =>
    stripe.refunds.list({
      charge: charge.id,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    }),
  );
  const released = new Set(input.authorization_release_refund_ids);
  const refundEvents = refunds.data.some(
    (refund) => refund.status === "succeeded",
  )
    ? await list("refund_events", (cursor) =>
        stripe.events.list({
          types: ["refund.created", "refund.updated", "charge.refund.updated"],
          created: { gte: charge.created },
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        }),
      )
    : null;
  const releaseCandidates = refunds.data.filter(
    (refund) =>
      released.has(refund.id) || refund.reason === "expired_uncaptured_charge",
  );
  const validRelease =
    refunds.complete &&
    [...released].every((releaseId) =>
      releaseCandidates.some((refund) => refund.id === releaseId),
    ) &&
    releaseCandidates.every(
      (refund) =>
        refund.status === "succeeded" &&
        refund.currency === "usd" &&
        objectId(refund.charge) === charge.id &&
        objectId(refund.payment_intent) === objectId(charge.payment_intent) &&
        Number.isSafeInteger(refund.amount) &&
        refund.amount > 0,
    ) &&
    releaseCandidates.reduce(
      (sum, refund) => sum + BigInt(refund.amount),
      0n,
    ) ===
      BigInt(charge.amount) - BigInt(charge.amount_captured);
  for (const refund of refunds.data) {
    if (
      objectId(refund.charge) !== charge.id ||
      refund.currency !== "usd" ||
      objectId(refund.payment_intent) !== objectId(charge.payment_intent)
    ) {
      issue(refund.id, "refund_scope_mismatch");
      continue;
    }
    const release =
      refund.reason === "expired_uncaptured_charge" || released.has(refund.id);
    const confirmed = refund.status === "succeeded";
    const completedEvents =
      refundEvents?.data.filter((event) => {
        if (
          ![
            "refund.created",
            "refund.updated",
            "charge.refund.updated",
          ].includes(event.type) ||
          event.data.object.object !== "refund"
        )
          return false;
        const object = event.data.object;
        const previous = event.data.previous_attributes as
          { status?: Stripe.Refund["status"] } | undefined;
        return (
          isStripeLivemode(event.livemode, input.mode) &&
          (!event.account || event.account === input.account_id) &&
          object.id === refund.id &&
          object.status === "succeeded" &&
          object.amount === refund.amount &&
          object.currency === "usd" &&
          objectId(object.charge) === charge.id &&
          objectId(object.payment_intent) === objectId(charge.payment_intent) &&
          event.created >= refund.created &&
          event.created * 1000 <= parseISO(input.recorded_at).getTime() &&
          (event.type === "refund.created" ||
            (previous?.status !== undefined && previous.status !== "succeeded"))
        );
      }) ?? [];
    const completedTimes = new Set(
      completedEvents.map((event) => event.created),
    );
    const completedEvent =
      refundEvents?.complete && completedTimes.size === 1
        ? completedEvents.sort((left, right) =>
            left.id.localeCompare(right.id),
          )[0]
        : null;
    if (confirmed && !completedEvent)
      issue(refund.id, "refund_time_unverified");
    addFact(
      release ? "authorization_release" : "refund",
      refund,
      {
        effect_status: confirmed
          ? "confirmed"
          : refund.status === "failed" || refund.status === "canceled"
            ? "failed"
            : "pending",
        effective_at:
          confirmed && completedEvent
            ? timestamp(completedEvent.created)
            : null,
        effective_source:
          confirmed && completedEvent ? "stripe_event_created" : "unknown",
        provider_event_id:
          confirmed && completedEvent ? completedEvent.id : null,
      },
      release ? !validRelease : charge.amount_captured === 0,
    );
  }
  for (const releaseId of released)
    if (!refunds.data.some((refund) => refund.id === releaseId))
      issue(releaseId, "release_not_observed");

  const paymentIntentId = objectId(charge.payment_intent);
  const sharedGroup =
    charge.transfer_group ??
    (paymentIntentId ? `group_${paymentIntentId}` : null);
  const scopes = [
    ...new Set(
      [sharedGroup, ...input.orders.map((order) => order.order_id)].filter(
        (scope): scope is string => scope !== null,
      ),
    ),
  ];
  const discoveredTransfers = new Map<string, Stripe.Transfer>();
  const conflictingTransfers = new Set<string>();
  for (const scope of scopes) {
    const transfers = await list(`transfers:${scope}`, (cursor) =>
      stripe.transfers.list({
        transfer_group: scope,
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    for (const transfer of transfers.data) {
      const previous = discoveredTransfers.get(transfer.id);
      if (
        transfer.transfer_group !== scope ||
        (previous && !isDeepStrictEqual(previous, transfer))
      )
        conflictingTransfers.add(transfer.id);
      if (!previous) discoveredTransfers.set(transfer.id, transfer);
    }
  }
  for (const transfer of discoveredTransfers.values()) {
    if (
      !isStripeLivemode(transfer.livemode, input.mode) ||
      transfer.currency !== "usd"
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Finance observation requires USD transfers in the expected mode",
      );
    const order = input.orders.find(
      (candidate) =>
        candidate.order_id ===
        (transfer.metadata?.order_id ?? transfer.transfer_group),
    );
    const conflict =
      conflictingTransfers.has(transfer.id) ||
      (transfer.transfer_group !== sharedGroup &&
        transfer.transfer_group !== order?.order_id) ||
      Boolean(transfer.metadata?.order_id && !order) ||
      Boolean(
        order &&
        transfer.metadata?.seller_id &&
        transfer.metadata.seller_id !== order.seller_id,
      ) ||
      Boolean(
        order &&
        objectId(transfer.destination) !== order.destination_account_id,
      ) ||
      objectId(transfer.source_transaction) !== charge.id;
    addFact(
      "transfer",
      transfer,
      {
        transfer_id: transfer.id,
        destination_account_id: objectId(transfer.destination),
        provider_transfer_group: transfer.transfer_group,
      },
      conflict,
    );
    const reversals = await list(`reversals:${transfer.id}`, (cursor) =>
      stripe.transfers.listReversals(transfer.id, {
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    );
    for (const reversal of reversals.data) {
      if (
        reversal.currency !== "usd" ||
        objectId(reversal.transfer) !== transfer.id
      ) {
        issue(reversal.id, "reversal_scope_mismatch");
        continue;
      }
      addFact(
        "reversal",
        reversal,
        {
          transfer_id: transfer.id,
          destination_account_id: objectId(transfer.destination),
          provider_transfer_group: transfer.transfer_group,
        },
        conflict,
      );
    }
    if (
      reversals.complete &&
      reversals.data.reduce((sum, row) => sum + row.amount, 0) !==
        transfer.amount_reversed
    )
      issue(transfer.id, "reversal_total_mismatch");
  }
  for (const attribution of input.attributions)
    if (!usedAttributions.has(attribution))
      issue(attribution.provider_id, "attribution_not_observed");

  const costs: ProviderFinanceCost[] = [];
  const transactionIds = new Set(
    facts
      .map((fact) => fact.balance_transaction_id)
      .filter((value): value is string => value !== null),
  );
  for (const fact of facts)
    if (!fact.balance_transaction_id && fact.kind !== "authorization_release")
      issue(fact.key, "cost_reference_missing");
  const transactions = new Map<string, Stripe.BalanceTransaction>();
  for (const transactionId of transactionIds) {
    try {
      transactions.set(
        transactionId,
        await stripe.balanceTransactions.retrieve(transactionId),
      );
    } catch {
      issue(transactionId, "cost_unavailable");
    }
  }
  const releaseFacts = facts.filter(
    (fact) => fact.kind === "authorization_release",
  );
  const releaseTransactionIds = releaseFacts.map(
    (fact) => fact.balance_transaction_id,
  );
  // Legacy Stripe partial captures expose the authorized charge and a separate
  // release. Prove both raw balance legs; the capture fact remains amount_captured.
  const hasVerifiedGrossCapture =
    charge.captured &&
    charge.paid &&
    charge.amount_captured > 0 &&
    charge.amount > charge.amount_captured &&
    objectId(charge.payment_intent) !== null &&
    validRelease &&
    releaseCandidates.length > 0 &&
    releaseFacts.length === releaseCandidates.length &&
    new Set(releaseTransactionIds).size === releaseTransactionIds.length &&
    releaseFacts.every((fact) => {
      const refund = releaseCandidates.find(
        (row) => row.id === fact.provider_id,
      );
      const transaction = fact.balance_transaction_id
        ? transactions.get(fact.balance_transaction_id)
        : undefined;
      return (
        refund &&
        fact.effect_status === "confirmed" &&
        fact.reconciliation_status !== "conflict" &&
        fact.amount_minor === refund.amount &&
        fact.balance_transaction_id !== objectId(charge.balance_transaction) &&
        transaction &&
        transaction.id === fact.balance_transaction_id &&
        objectId(transaction.source) === refund.id &&
        transaction.currency === "usd" &&
        [transaction.amount, transaction.fee, transaction.net].every(
          Number.isSafeInteger,
        ) &&
        (transaction.status === "pending" ||
          transaction.status === "available") &&
        transaction.amount === -refund.amount &&
        BigInt(transaction.net) ===
          BigInt(transaction.amount) - BigInt(transaction.fee) &&
        transaction.fee_details.every(
          (fee) => fee.currency === "usd" && Number.isSafeInteger(fee.amount),
        ) &&
        (transaction.status !== "available" ||
          transaction.fee_details.reduce(
            (sum, fee) => sum + BigInt(fee.amount),
            0n,
          ) === BigInt(transaction.fee))
      );
    }) &&
    BigInt(charge.amount) +
      releaseFacts.reduce(
        (sum, fact) =>
          sum + BigInt(transactions.get(fact.balance_transaction_id!)!.amount),
        0n,
      ) ===
      BigInt(charge.amount_captured);
  for (const transactionId of transactionIds) {
    let transaction = transactions.get(transactionId) ?? null;
    const sourceFacts = facts.filter(
      (fact) => fact.balance_transaction_id === transactionId,
    );
    const source = objectId(transaction?.source);
    const sourceFact = sourceFacts.find(
      (fact) =>
        fact.provider_id === source ||
        // Stripe can identify a reversal's balance source by its parent transfer.
        (fact.kind === "reversal" &&
          fact.transfer_id !== null &&
          fact.transfer_id === source),
    );
    const expectedAmount = sourceFact
      ? (sourceFact.kind === "capture" &&
        hasVerifiedGrossCapture &&
        transaction?.amount === charge.amount
          ? charge.amount
          : sourceFact.amount_minor) *
        (["refund", "authorization_release", "transfer"].includes(
          sourceFact.kind,
        )
          ? -1
          : 1)
      : null;
    if (
      transaction &&
      (transaction.id !== transactionId ||
        transaction.currency !== "usd" ||
        transaction.amount !== expectedAmount ||
        transaction.net !== transaction.amount - transaction.fee ||
        transaction.fee_details.some((fee) => fee.currency !== "usd") ||
        (transaction.status === "available" &&
          transaction.fee_details.reduce((sum, fee) => sum + fee.amount, 0) !==
            transaction.fee))
    ) {
      issue(transactionId, "cost_mismatch");
      transaction = null;
    }
    const status =
      transaction?.status === "available"
        ? "confirmed"
        : transaction?.status === "pending"
          ? "pending"
          : "unavailable";
    if (status !== "confirmed") issue(transactionId, `cost_${status}`);
    costs.push(
      providerFinanceCostSchema.parse({
        key: uniqueKey(
          input.mode,
          input.account_id,
          "balance_transaction",
          transactionId,
        ),
        provider: "stripe",
        mode: input.mode,
        account_id: input.account_id,
        balance_transaction_id: transactionId,
        source_id: objectId(transaction?.source),
        status,
        currency_code: "usd",
        amount_minor: transaction?.amount ?? null,
        // Pending fees, especially zero, are not a confirmed cost estimate.
        fee_minor: status === "confirmed" ? transaction?.fee : null,
        net_minor: status === "confirmed" ? transaction?.net : null,
        fee_details:
          status === "confirmed"
            ? transaction?.fee_details.map((fee) => ({
                amount_minor: fee.amount,
                currency_code: fee.currency,
                type: fee.type,
                application: fee.application,
                description: fee.description,
              }))
            : null,
        provider_created_at: transaction
          ? timestamp(transaction.created)
          : null,
        available_at: transaction ? timestamp(transaction.available_on) : null,
        recorded_at: input.recorded_at,
        reconciled_at: status === "confirmed" ? input.recorded_at : null,
        allocation: "platform_unallocated",
      }),
    );
  }
  return { facts, costs, coverage };
}

/** Retained provider evidence survives the Events API's 30-day expiry. */
export function mergeProviderFinanceFact(
  previous: ProviderFinanceFact,
  next: ProviderFinanceFact,
): ProviderFinanceFact {
  previous = providerFinanceFactSchema.parse(previous);
  next = providerFinanceFactSchema.parse(next);
  for (const fact of [previous, next]) {
    if (
      ["refund", "authorization_release"].includes(fact.kind) &&
      fact.effective_source === "stripe_object_created"
    ) {
      fact.effective_at = null;
      fact.effective_source = "unknown";
      fact.provider_event_id = null;
      fact.reconciled_at = null;
    }
  }
  const verifiedRelease =
    previous.kind === "refund" &&
    next.kind === "authorization_release" &&
    previous.reconciliation_status === "unattributed" &&
    next.reconciliation_status === "matched" &&
    previous.operation_id === null &&
    previous.order_id === null &&
    previous.seller_id === null &&
    previous.native_id === null;
  const immutable = [
    "key",
    "provider",
    "mode",
    "account_id",
    "group_id",
    "provider_id",
    "charge_id",
    "amount_minor",
    "currency_code",
    "provider_created_at",
    "component_attribution",
  ] as const;
  const enrichable = [
    "operation_id",
    "order_id",
    "seller_id",
    "native_id",
    "payment_intent_id",
    "transfer_id",
    "destination_account_id",
    "provider_operation_id",
    "provider_order_id",
    "provider_seller_id",
    "provider_transfer_group",
    "balance_transaction_id",
    "effective_at",
    "provider_event_id",
  ] as const;
  if (
    (previous.kind !== next.kind && !verifiedRelease) ||
    immutable.some((field) => previous[field] !== next[field]) ||
    enrichable.some(
      (field) =>
        previous[field] !== null &&
        next[field] !== null &&
        previous[field] !== next[field],
    ) ||
    (previous.data_kind !== "unknown" &&
      next.data_kind !== "unknown" &&
      previous.data_kind !== next.data_kind) ||
    (previous.effect_status === "confirmed" &&
      next.effect_status !== "confirmed") ||
    (previous.effective_source !== "unknown" &&
      next.effective_source !== "unknown" &&
      previous.effective_source !== next.effective_source) ||
    (previous.reconciliation_status === "matched" &&
      next.reconciliation_status === "conflict")
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Conflicting provider fact evidence",
    );
  const merged = {
    ...next,
    recorded_at: previous.recorded_at,
    data_kind:
      previous.data_kind !== "unknown" ? previous.data_kind : next.data_kind,
    reconciliation_status:
      previous.reconciliation_status === "matched"
        ? "matched"
        : next.reconciliation_status,
    effective_source: previous.effective_at
      ? previous.effective_source
      : next.effective_source,
    reconciled_at:
      previous.reconciliation_status === "matched" ||
      next.reconciliation_status === "matched"
        ? (previous.reconciled_at ?? next.reconciled_at)
        : null,
  };
  for (const field of enrichable)
    merged[field] = previous[field] ?? next[field];
  return providerFinanceFactSchema.parse(merged);
}
