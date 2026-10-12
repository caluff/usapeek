import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseISO } from "date-fns/parseISO";
import { addHours } from "date-fns/addHours";
import {
  InjectManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from "@medusajs/framework/utils";
import type { Context, DAL, InferTypeOf } from "@medusajs/framework/types";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { z } from "@medusajs/framework/zod";
import { CommerceGroupState } from "./models/commerce-group-state";
import { CommerceOperation } from "./models/commerce-operation";
import { CommerceScan } from "./models/commerce-scan";
import { FinanceSaleSnapshot } from "./models/finance-sale-snapshot";
import { FinanceRecoveryAttempt } from "./models/finance-recovery-attempt";
import { FinanceProviderFact } from "./models/finance-provider-fact";
import { FinanceProviderCost } from "./models/finance-provider-cost";
import { OrderCompletion } from "./models/order-completion";
import { VendorSettlementProjection } from "./models/vendor-settlement-projection";
import { VendorFinanceReportingProjection } from "./models/vendor-finance-reporting-projection";
import { AdminFinanceReportingProjection } from "./models/admin-finance-reporting-projection";
import {
  readAdminReportingRegistry,
  readAdminReportingGroupSource,
  listDirtyAdminReportingGroups,
  saveAdminReportingProjection,
  type AdminReportingSource,
} from "./admin-finance-reporting";
import {
  readVendorReportingRegistry,
  readReportingDiscovery,
  saveReportingDiscovery,
  readReportingGroupSource,
  listDirtyReportingGroups,
  registerReportingReferences,
  invalidateReportingRegistry,
  saveReportingGroupProjection,
  type ReportingReference,
  type ReportingSource,
  type ReportingDiscovery,
} from "./vendor-finance-reporting";
import {
  readSettlementRegistry,
  listDirtySettlementGroups,
  readSettlementGroupSource,
  invalidateSettlementRegistry,
  saveSettlementGroupProjection,
  type RegistryReadInput,
  type SettlementSourceRow,
  type SettlementProjection,
} from "./vendor-settlements";
import {
  mergeProviderFinanceFact,
  providerFinanceFactSchema,
  providerFinanceCostSchema,
  providerFactCoverageSchema,
  providerFinanceObservationMetadataSchema,
  providerFinanceObservationSchema,
  type ProviderFinanceFact,
  type ProviderFinanceCost,
  type ProviderFactsObservation,
} from "../../lib/order-finance/provider-facts";
import {
  originalSaleSchema,
  type OriginalSale,
} from "../../lib/order-finance/snapshot";
import {
  DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
  paymentReleaseDelayDaysSchema,
} from "../../lib/order-finance/contracts";

export type CommerceGroupRecord = InferTypeOf<typeof CommerceGroupState>;
export type CommerceOperationRecord = InferTypeOf<typeof CommerceOperation>;
export type OrderCompletionRecord = InferTypeOf<typeof OrderCompletion>;
export const orderCompletionReceiptSchema = z
  .object({
    id: z.string().startsWith("order_"),
    group_id: z.string().min(1),
    cart_id: z.string().min(1),
    seller_id: z.string().min(1),
    observed_order_updated_at: z.iso.datetime({ offset: true }),
    completed_at: z.iso.datetime({ offset: true }),
    eligible_at: z.iso.datetime({ offset: true }),
    release_delay_days: paymentReleaseDelayDaysSchema,
    registration_token: z.uuid(),
  })
  .strict();
export type OrderCompletionReceipt = z.infer<
  typeof orderCompletionReceiptSchema
>;
export type FinanceRecoveryAttemptRecord = InferTypeOf<
  typeof FinanceRecoveryAttempt
>;

export type ClaimRecoveryInput = {
  operationId: string;
  expectedToken: string;
  expectedState: CommerceOperationRecord["state"];
  actorId: string;
  reason: string;
  plan: Record<string, unknown>;
  observation: Record<string, unknown>;
};

export type FinishRecoveryInput = {
  operationId: string;
  token: string;
  attemptId: string;
  state: "complete" | "uncertain";
  result: Record<string, unknown>;
  observation: Record<string, unknown>;
};

export type CheckpointRecoveryInput = Pick<
  FinishRecoveryInput,
  "operationId" | "token" | "attemptId" | "result"
>;

export const financeExecutionWriterSchema = z
  .object({
    execution_owner_id: z.string().uuid(),
    execution_host: z.string().trim().min(1),
    execution_pid: z.number().int().positive().safe(),
  })
  .strict();
export type FinanceExecutionWriter = z.infer<
  typeof financeExecutionWriterSchema
>;
export const financeExecutionWriterCandidateSchema =
  financeExecutionWriterSchema.extend({
    group_token: z.string().uuid().optional(),
  });
export type FinanceExecutionWriterCandidate = z.infer<
  typeof financeExecutionWriterCandidateSchema
>;
const financeExecutionWritersSchema = z
  .array(financeExecutionWriterCandidateSchema)
  .refine(
    (writers) =>
      new Set(writers.map((writer) => writer.execution_owner_id)).size ===
      writers.length,
    "Finance execution writer identities must be unique.",
  );

export function readFinanceExecutionWriters(
  observation: unknown,
): FinanceExecutionWriterCandidate[] {
  if (observation == null) return [];
  if (!isRecord(observation))
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Commerce group observation is malformed.",
    );
  const writers = observation.finance_execution_writers;
  return writers === undefined
    ? []
    : financeExecutionWritersSchema.parse(writers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Recovery may append verified facts, but cannot rewrite a plan or an observed effect.
function appendRecoveryFacts(
  original: unknown,
  next: unknown,
  path: string[] = [],
): unknown {
  const frozenTree = [
    "plan",
    "capture_orders",
    "capture_evidence",
    "original_result",
  ].includes(path[0]);
  if (isRecord(original) && isRecord(next)) {
    const result = { ...original };
    for (const [key, value] of Object.entries(next)) {
      const frozenField =
        (path.length === 0 &&
          [
            "plan",
            "capture_orders",
            "amount",
            "credit_amount",
            "settlement",
            "original_result",
          ].includes(key)) ||
        (path.length === 1 &&
          path[0] === "settlement" &&
          [
            "version",
            "gross",
            "seller_net",
            "seller_entitlement_reduced",
            "seller_reversal_amount",
            "seller_reversed",
            "commission_returned",
            "component_attribution",
          ].includes(key));
      if (
        (frozenTree || frozenField) &&
        !Object.prototype.hasOwnProperty.call(original, key)
      ) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Recovery cannot replace the original plan or recorded financial facts.",
        );
      }
      const reversalId = next.reversal_id ?? original.reversal_id;
      if (
        path.length === 1 &&
        path[0] === "settlement" &&
        key === "seller_reversed" &&
        original.version === 2 &&
        original.seller_reversed === 0 &&
        typeof original.seller_reversal_amount === "number" &&
        original.seller_reversal_amount > 0 &&
        value === original.seller_reversal_amount &&
        typeof reversalId === "string" &&
        reversalId.trim() &&
        (original.reversal_id === undefined ||
          original.reversal_id === reversalId)
      ) {
        // The caller reconciles the reversal; only the frozen planned amount can become a fact.
        result[key] = value;
        continue;
      }
      result[key] = Object.prototype.hasOwnProperty.call(original, key)
        ? appendRecoveryFacts(original[key], value, [...path, key])
        : value;
    }
    return result;
  }
  if (Array.isArray(original) && Array.isArray(next)) {
    if (
      next.length >= original.length &&
      (!frozenTree || next.length === original.length)
    ) {
      return next.map((value, index) =>
        index < original.length
          ? appendRecoveryFacts(original[index], value, [
              ...path,
              String(index),
            ])
          : value,
      );
    }
  } else if (original === next) return original;
  if (
    path.length === 1 &&
    [
      "refund_attempted",
      "reversal_attempted",
      "capture_attempted",
      "cancel_authorization_attempted",
      "transfer_attempted",
      "payout_attempted",
      "linked",
    ].includes(path[0]) &&
    original === false &&
    next === true
  )
    return true;
  throw new MedusaError(
    MedusaError.Types.CONFLICT,
    "Recovery cannot replace the original plan or recorded financial facts.",
  );
}

function validateProviderCost(cost: ProviderFinanceCost): void {
  const known = cost.status === "confirmed";
  if (
    (known &&
      (cost.amount_minor === null ||
        cost.fee_minor === null ||
        cost.net_minor === null ||
        cost.fee_details === null ||
        cost.provider_created_at === null ||
        cost.reconciled_at === null ||
        cost.source_id === null ||
        BigInt(cost.amount_minor) - BigInt(cost.fee_minor) !==
          BigInt(cost.net_minor) ||
        cost.fee_details.reduce(
          (sum, fee) => sum + BigInt(fee.amount_minor),
          0n,
        ) !== BigInt(cost.fee_minor))) ||
    (!known &&
      (cost.fee_minor !== null ||
        cost.net_minor !== null ||
        cost.fee_details !== null))
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Provider costs require consistent confirmed evidence or explicit unknown fees.",
    );
  }
}

function mergeProviderCost(
  previous: ProviderFinanceCost,
  next: ProviderFinanceCost,
): ProviderFinanceCost {
  for (const key of [
    "key",
    "provider",
    "mode",
    "account_id",
    "balance_transaction_id",
    "currency_code",
    "allocation",
  ] as const) {
    if (previous[key] !== next[key]) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Provider cost identity changed.",
      );
    }
  }
  for (const key of [
    "source_id",
    "amount_minor",
    "fee_minor",
    "net_minor",
    "fee_details",
    "provider_created_at",
  ] as const) {
    if (
      previous[key] !== null &&
      next[key] !== null &&
      !isDeepStrictEqual(previous[key], next[key])
    ) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Confirmed provider cost evidence changed.",
      );
    }
  }
  if (previous.status === "confirmed") return previous;
  return providerFinanceCostSchema.parse({
    ...next,
    status:
      previous.status === "pending" && next.status === "unavailable"
        ? "pending"
        : next.status,
    source_id: previous.source_id ?? next.source_id,
    amount_minor: previous.amount_minor ?? next.amount_minor,
    provider_created_at:
      previous.provider_created_at ?? next.provider_created_at,
    available_at: next.available_at ?? previous.available_at,
    recorded_at: previous.recorded_at,
  });
}

class CommerceAutomationService extends MedusaService({
  CommerceGroupState,
  CommerceOperation,
  CommerceScan,
  FinanceSaleSnapshot,
  FinanceRecoveryAttempt,
  FinanceProviderFact,
  FinanceProviderCost,
  OrderCompletion,
  VendorSettlementProjection,
  VendorFinanceReportingProjection,
  AdminFinanceReportingProjection,
}) {
  protected baseRepository_: DAL.RepositoryService;
  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(container);
    this.baseRepository_ = container.baseRepository;
  }

  private async committed<T>(
    work: (manager: EntityManager) => Promise<T>,
    hasParentTransaction: boolean,
  ): Promise<T> {
    // A fence rolled back by an enclosing workflow transaction cannot guard an external effect.
    if (hasParentTransaction)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Commerce fencing requires its own committed transaction.",
      );
    return this.baseRepository_.transaction(work);
  }

  @InjectManager()
  async readVendorFinanceReportingRegistry(
    input: { seller_id: string; now: Date },
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return readVendorReportingRegistry(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
      input,
    );
  }

  @InjectManager()
  async readVendorReportingDiscovery(
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return readReportingDiscovery(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
    );
  }

  @InjectManager()
  async saveVendorReportingDiscovery(
    input: {
      references: ReportingReference[];
      expected: ReportingDiscovery;
      next: ReportingDiscovery;
    },
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return this.committed(
      (manager) => saveReportingDiscovery(manager, input),
      Boolean(context?.transactionManager),
    );
  }

  @InjectManager()
  async registerVendorReportingReferences(
    references: ReportingReference[],
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return this.committed(
      (manager) => registerReportingReferences(manager, references),
      Boolean(context?.transactionManager),
    );
  }

  @InjectManager()
  async invalidateVendorFinanceReporting(
    orderIds: string[],
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return this.committed(
      (manager) => invalidateReportingRegistry(manager, orderIds),
      Boolean(context?.transactionManager),
    );
  }

  @InjectManager()
  async listDirtyVendorReportingGroups(
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return listDirtyReportingGroups(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
      new Date(),
    );
  }

  @InjectManager()
  async readVendorReportingGroupSource(
    groupId: string,
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return readReportingGroupSource(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
      z.string().min(1).parse(groupId),
    );
  }

  @InjectManager()
  async saveVendorReportingProjection(
    input: {
      source: ReportingSource[];
      projections: Array<{ id: string; sources: unknown }>;
      refreshed_at: Date;
      admin?: { source: AdminReportingSource; sources: unknown };
    },
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return this.committed(
      async (manager) => {
        if (input.admin && (input.source.length !== input.admin.source.references.length ||
          new Set(input.source.map((row) => row.id)).size !== input.source.length ||
          input.source.some((row) => row.group_id !== input.admin!.source.id || row.cart_id !== input.admin!.source.cart_id ||
            !input.admin!.source.references.some((reference) => reference.id === row.id && reference.seller_id === row.seller_id &&
              reference.native_revision === row.native_revision && reference.order_display_id === row.order_display_id &&
              reference.order_custom_display_id === row.order_custom_display_id))))
          throw new MedusaError(MedusaError.Types.CONFLICT, "Admin and seller reporting sources must describe the same native group.");
        if (input.admin && !await saveAdminReportingProjection(manager, {
          ...input.admin, refreshed_at: input.refreshed_at,
        })) return false;
        const saved = await saveReportingGroupProjection(manager, input);
        if (!saved && input.admin)
          throw new MedusaError(MedusaError.Types.CONFLICT, "Reporting sources changed; both projections were rolled back.");
        return saved;
      },
      Boolean(context?.transactionManager),
    );
  }

  @InjectManager()
  async readAdminFinanceReportingRegistry(@MedusaContext() context?: Context<EntityManager>) {
    return readAdminReportingRegistry(context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>());
  }

  @InjectManager()
  async readAdminReportingGroupSource(groupId: string, @MedusaContext() context?: Context<EntityManager>) {
    return readAdminReportingGroupSource(context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(), groupId);
  }

  @InjectManager()
  async listDirtyAdminReportingGroups(@MedusaContext() context?: Context<EntityManager>) {
    return listDirtyAdminReportingGroups(context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(), new Date());
  }

  @InjectManager()
  async readVendorSettlements(
    input: RegistryReadInput,
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return readSettlementRegistry(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
      input,
    );
  }

  @InjectManager()
  async listDirtyVendorSettlementGroups(
    input: { take: number; now: Date },
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    const parsed = z
      .object({ take: z.number().int().min(1).max(10), now: z.date() })
      .parse(input);
    return listDirtySettlementGroups(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
      parsed.take,
      parsed.now,
    );
  }

  @InjectManager()
  async readVendorSettlementGroupSource(
    groupId: string,
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return readSettlementGroupSource(
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>(),
      z.string().min(1).parse(groupId),
    );
  }

  @InjectManager()
  async invalidateVendorSettlements(
    orderIds: string[],
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return this.committed(
      (manager) => invalidateSettlementRegistry(manager, orderIds),
      Boolean(context?.transactionManager),
    );
  }

  @InjectManager()
  async saveVendorSettlementProjection(
    input: {
      source: SettlementSourceRow[];
      projections: SettlementProjection[];
      refreshed_at: Date;
    },
    @MedusaContext() context?: Context<EntityManager>,
  ) {
    return this.committed(
      (manager) => saveSettlementGroupProjection(manager, input),
      Boolean(context?.transactionManager),
    );
  }

  // Commit the process identity before acquiring a non-expiring execution lock.
  // Otherwise a crash before the operation claim would leave an owner with no durable identity.
  @InjectManager()
  async registerFinanceExecutionWriter(
    input: { groupId: string; cartId: string; writer: FinanceExecutionWriter },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<FinanceExecutionWriterCandidate[]> {
    const groupId = z.string().trim().min(1).parse(input.groupId);
    const cartId = z.string().trim().min(1).parse(input.cartId);
    const writer = financeExecutionWriterSchema.parse(input.writer);
    return this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const now = new Date();
      await table()
        .insert({
          id: groupId,
          cart_id: cartId,
          active_token: null,
          review_required: false,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore();
      const group: CommerceGroupRecord | undefined = await table()
        .where({ id: groupId })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!group || group.cart_id !== cartId)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group/cart binding changed.",
        );
      const writers = readFinanceExecutionWriters(group.observation);
      const existing = writers.find(
        (candidate) =>
          candidate.execution_owner_id === writer.execution_owner_id,
      );
      if (existing) {
        const identity = {
          execution_owner_id: existing.execution_owner_id,
          execution_host: existing.execution_host,
          execution_pid: existing.execution_pid,
        };
        if (!isDeepStrictEqual(identity, writer))
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Finance execution writer identity changed.",
          );
        return writers;
      }
      const registered = [...writers, writer];
      await table()
        .where({ id: groupId, cart_id: cartId })
        .whereNull("deleted_at")
        .update({
          observation: JSON.stringify({
            ...group.observation,
            finance_execution_writers: registered,
          }),
          updated_at: now,
        });
      return registered;
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async removeFinanceExecutionWriter(
    input: { groupId: string; cartId: string; ownerId: string },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    const groupId = z.string().trim().min(1).parse(input.groupId);
    const cartId = z.string().trim().min(1).parse(input.cartId);
    const ownerId = z.string().uuid().parse(input.ownerId);
    await this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const group: CommerceGroupRecord | undefined = await table()
        .where({ id: groupId })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!group || group.cart_id !== cartId)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group/cart binding changed.",
        );
      const writers = readFinanceExecutionWriters(group.observation);
      const remaining = writers.filter(
        (writer) =>
          writer.execution_owner_id !== ownerId ||
          (writer.group_token !== undefined &&
            writer.group_token === group.active_token),
      );
      if (remaining.length === writers.length) return;
      await table()
        .where({ id: groupId, cart_id: cartId })
        .whereNull("deleted_at")
        .update({
          observation: JSON.stringify({
            ...group.observation,
            finance_execution_writers: remaining,
          }),
          updated_at: new Date(),
        });
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async claimFinanceGroup(
    input: { groupId: string; cartId: string; ownerId: string },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<CommerceGroupRecord | null> {
    const ownerId = z.string().uuid().parse(input.ownerId);
    return this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const group: CommerceGroupRecord | undefined = await table()
        .where({ id: input.groupId })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!group || group.cart_id !== input.cartId)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group/cart binding changed.",
        );
      const writers = readFinanceExecutionWriters(group.observation);
      const writer = writers.find(
        (candidate) => candidate.execution_owner_id === ownerId,
      );
      if (!writer)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution writer was not durably registered.",
        );
      if (group.active_token)
        return group.active_token === writer.group_token ? group : null;
      const token = randomUUID();
      const [claimed]: CommerceGroupRecord[] = await table()
        .where({ id: input.groupId, cart_id: input.cartId })
        .whereNull("deleted_at")
        .whereNull("active_token")
        .update({
          active_token: token,
          observation: JSON.stringify({
            ...group.observation,
            finance_execution_writers: writers.map((candidate) =>
              candidate.execution_owner_id === ownerId
                ? { ...candidate, group_token: token }
                : candidate,
            ),
          }),
          updated_at: new Date(),
        })
        .returning("*");
      if (!claimed)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group ownership changed.",
        );
      return claimed;
    }, Boolean(context?.transactionManager));
  }

  // The workflow owns a new execution lock and verifies that this exact prior process stopped.
  @InjectManager()
  async resolveFinanceExecutionFence(
    input: {
      groupId: string;
      cartId: string;
      ownerId: string;
      actorId: string;
      reason: string;
    },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<{ fenceReleased: boolean }> {
    const ownerId = z.string().uuid().parse(input.ownerId);
    const actorId = z.string().trim().min(1).parse(input.actorId);
    const reason = z.string().trim().min(1).parse(input.reason);
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const group: CommerceGroupRecord | undefined = await table(
        "commerce_group_state",
      )
        .where({ id: input.groupId })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!group || group.cart_id !== input.cartId)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group/cart binding changed.",
        );
      const writers = readFinanceExecutionWriters(group.observation);
      const writer = writers.find(
        (candidate) => candidate.execution_owner_id === ownerId,
      );
      if (!writer)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution writer was not durably registered.",
        );
      const observation = { ...group.observation };
      const hasFence =
        writer.group_token !== undefined &&
        writer.group_token === group.active_token;
      if (hasFence) {
        const operation = await table("commerce_operation")
          .where({ group_id: input.groupId, token: writer.group_token })
          .first();
        const holds = observation.held_order_ids;
        const otherContext = Object.keys(observation).some(
          (key) =>
            ![
              "finance_allocation",
              "finance_final_capture",
              "finance_provider_observation",
              "finance_execution_writers",
              "finance_execution_recoveries",
              "finance_review",
              "held_order_ids",
            ].includes(key),
        );
        if (
          operation ||
          group.review_required ||
          observation.finance_review != null ||
          (holds != null && (!Array.isArray(holds) || holds.length > 0)) ||
          otherContext
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Finance execution fence has an operation, review or hold that requires operation recovery.",
          );
        }
      } else if (writer.group_token && group.active_token) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group ownership changed.",
        );
      }
      const priorAudit = observation.finance_execution_recoveries;
      if (
        priorAudit !== undefined &&
        (!Array.isArray(priorAudit) || !priorAudit.every(isRecord))
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution recovery audit is malformed.",
        );
      const now = new Date();
      const audit = {
        id: randomUUID(),
        ...writer,
        actor_id: actorId,
        reason,
        fence_released: hasFence,
        recorded_at: now.toISOString(),
      };
      const changed = await table("commerce_group_state")
        .where({
          id: input.groupId,
          cart_id: input.cartId,
          active_token: group.active_token,
        })
        .whereNull("deleted_at")
        .update({
          ...(hasFence ? { active_token: null } : {}),
          observation: JSON.stringify({
            ...observation,
            finance_execution_recoveries: [...(priorAudit ?? []), audit],
          }),
          updated_at: now,
        });
      if (changed !== 1)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Finance execution group ownership changed.",
        );
      return { fenceReleased: hasFence };
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async recordOriginalSales(
    sales: OriginalSale[],
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<string[]> {
    const originals = sales.map((sale) => originalSaleSchema.parse(sale));
    return this.committed(async (manager) => {
      const created: string[] = [];
      for (const sale of originals) {
        const rows: { id: string }[] = await manager
          .getKnex()("finance_sale_snapshot")
          .transacting(manager.getTransactionContext()!)
          .insert({
            id: sale.order_id,
            group_id: sale.group_id,
            cart_id: sale.cart_id,
            seller_id: sale.seller_id,
            currency_code: sale.currency_code,
            original: JSON.stringify(sale),
          })
          .onConflict("id")
          .ignore()
          .returning("id");
        if (rows.length) created.push(sale.order_id);
        else {
          const existing: { original: unknown } = await manager
            .getKnex()("finance_sale_snapshot")
            .transacting(manager.getTransactionContext()!)
            .where({ id: sale.order_id })
            .first();
          if (
            JSON.stringify(originalSaleSchema.parse(existing.original)) !==
            JSON.stringify(sale)
          ) {
            throw new MedusaError(
              MedusaError.Types.CONFLICT,
              "El original financiero ya existe y es inmutable.",
            );
          }
        }
      }
      return created;
    }, Boolean(context?.transactionManager));
  }

  // Only the checkout compensation uses these IDs, returned by the successful insert.
  @InjectManager()
  async discardOriginalSales(
    ids: string[],
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    if (!ids.length) return;
    await this.committed(async (manager) => {
      await manager
        .getKnex()("finance_sale_snapshot")
        .transacting(manager.getTransactionContext()!)
        .whereIn("id", ids)
        .delete();
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async recordOrderCompletions(
    confirmedOrders: {
      id: string;
      observed_order_updated_at: string;
      release_delay_days?: number;
    }[],
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<OrderCompletionReceipt[]> {
    const orders = z
      .array(
        z
          .object({
            id: z.string().startsWith("order_"),
            observed_order_updated_at: z.iso.datetime({ offset: true }),
            release_delay_days: paymentReleaseDelayDaysSchema.default(
              DEFAULT_PAYMENT_RELEASE_DELAY_DAYS,
            ),
          })
          .strict(),
      )
      .parse(confirmedOrders);
    const unique = new Map<string, (typeof orders)[number]>();
    for (const order of orders) {
      const previous = unique.get(order.id);
      if (
        previous &&
        (previous.observed_order_updated_at !== order.observed_order_updated_at ||
          previous.release_delay_days !== order.release_delay_days)
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Completion observations disagree about the order update proof.",
        );
      unique.set(order.id, order);
    }
    if (!unique.size) return [];
    return this.committed(async (manager) => {
      const receipts: OrderCompletionReceipt[] = [];
      const completedAt = new Date();
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      for (const [id, order] of unique) {
        const observedOrderUpdatedAt = parseISO(order.observed_order_updated_at);
        const eligibleAt = addHours(completedAt, order.release_delay_days * 24);
        const snapshot:
          | {
              id: string;
              group_id: string;
              cart_id: string;
              seller_id: string;
              currency_code: string;
              original: unknown;
            }
          | undefined = await table("finance_sale_snapshot")
          .where({ id })
          .whereNull("deleted_at")
          .forUpdate()
          .first();
        // Completion does not introduce a financial original or backfill its past.
        if (!snapshot) continue;
        const original = originalSaleSchema.parse(snapshot.original);
        if (
          original.order_id !== id ||
          original.group_id !== snapshot.group_id ||
          original.cart_id !== snapshot.cart_id ||
          original.seller_id !== snapshot.seller_id ||
          original.currency_code !== snapshot.currency_code
        ) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Order completion requires an unchanged financial original.",
          );
        }
        const receipt = orderCompletionReceiptSchema.parse({
          id,
          group_id: original.group_id,
          cart_id: original.cart_id,
          seller_id: original.seller_id,
          observed_order_updated_at: observedOrderUpdatedAt.toISOString(),
          completed_at: completedAt.toISOString(),
          eligible_at: eligibleAt.toISOString(),
          release_delay_days: order.release_delay_days,
          registration_token: randomUUID(),
        });
        const rows: { id: string }[] = await table("order_completion")
          .insert({
            ...receipt,
            completed_at: completedAt,
            eligible_at: eligibleAt,
            observed_order_updated_at: observedOrderUpdatedAt,
            created_at: completedAt,
            updated_at: completedAt,
          })
          .onConflict("id")
          .ignore()
          .returning("id");
        if (rows.length) {
          receipts.push(receipt);
          continue;
        }
        const existing: OrderCompletionRecord | undefined = await table(
          "order_completion",
        )
          .where({ id })
          .whereNull("deleted_at")
          .first();
        if (
          !existing ||
          existing.group_id !== original.group_id ||
          existing.cart_id !== original.cart_id ||
          existing.seller_id !== original.seller_id ||
          existing.observed_order_updated_at.getTime() !==
            observedOrderUpdatedAt.getTime() ||
          existing.eligible_at.getTime() !==
            addHours(
              existing.completed_at,
              paymentReleaseDelayDaysSchema.parse(existing.release_delay_days) * 24,
            ).getTime()
        ) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "The order completion clock or financial binding changed.",
          );
        }
      }
      return receipts;
    }, Boolean(context?.transactionManager));
  }

  async readOrderCompletion(
    orderId: string,
  ): Promise<OrderCompletionRecord | null> {
    const id = z.string().startsWith("order_").parse(orderId);
    const [record] = await this.listOrderCompletions({ id }, { take: 1 });
    return record ?? null;
  }

  async readAutomaticSettlementScan(): Promise<string | null> {
    const [scan] = await this.listCommerceScans(
      { id: "automatic-settlements" },
      { take: 1 },
    );
    return scan?.position ?? null;
  }

  @InjectManager()
  async listDueOrderCompletions(
    input: {
      position: string | null;
      now: Date;
      take: number;
    },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<OrderCompletionRecord[]> {
    const parsed = z
      .object({
        position: z.string().nullable(),
        now: z.date(),
        take: z.number().int().min(1).max(100),
      })
      .parse(input);
    const manager =
      context?.manager ?? this.baseRepository_.getFreshManager<EntityManager>();
    const query = manager
      .getKnex()("order_completion")
      .select("*")
      .whereNull("deleted_at")
      .where("eligible_at", "<=", parsed.now)
      .whereRaw(
        `not exists (select 1 from "commerce_operation"
        where "commerce_operation"."id" = ? || "order_completion"."id"
        and "commerce_operation"."deleted_at" is null)`,
        ["payout:"],
      )
      .orderBy("id", "asc")
      .limit(parsed.take);
    if (parsed.position) query.where("id", ">", parsed.position);
    return query;
  }

  @InjectManager()
  async advanceAutomaticSettlementScan(
    expected: string | null,
    position: string | null,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    z.string().nullable().parse(expected);
    z.string().nullable().parse(position);
    await this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_scan")
          .transacting(manager.getTransactionContext()!);
      const now = new Date();
      await table()
        .insert({
          id: "automatic-settlements",
          position: null,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore();
      await table()
        .where({ id: "automatic-settlements", position: expected })
        .whereNull("deleted_at")
        .update({ position, updated_at: now });
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async claimGroup(
    groupId: string,
    cartId: string,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<CommerceGroupRecord | null> {
    return this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const now = new Date();
      await table()
        .insert({
          id: groupId,
          cart_id: cartId,
          review_required: false,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore();
      const [claim]: CommerceGroupRecord[] = await table()
        .where({ id: groupId, cart_id: cartId })
        .whereNull("deleted_at")
        .whereNull("active_token")
        .update({ active_token: randomUUID(), updated_at: now })
        .returning("*");
      // No lease expiry: a crash or uncertain provider response requires operator reconciliation.
      return claim ?? null;
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async observeGroup(
    groupId: string,
    token: string,
    observation: Record<string, unknown>,
    requiresReview: boolean,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    if (
      ["finance_execution_writers", "finance_execution_recoveries"].some(
        (key) => Object.prototype.hasOwnProperty.call(observation, key),
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Finance execution identities require their dedicated registration methods.",
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(
        observation,
        "finance_provider_observation",
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Provider observation coverage must be recorded with its financial facts.",
      );
    }
    await this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const row: CommerceGroupRecord | undefined = await table()
        .where({ id: groupId, active_token: token })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!row)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce group ownership changed.",
        );
      const priorHolds = row.observation?.held_order_ids;
      const nextHolds = observation.held_order_ids;
      const heldOrderIds = [
        ...new Set(
          [
            ...(Array.isArray(priorHolds) ? priorHolds : []),
            ...(Array.isArray(nextHolds) ? nextHolds : []),
          ].filter((id): id is string => typeof id === "string"),
        ),
      ];
      await table()
        .where({ id: groupId, active_token: token })
        .update({
          observation: JSON.stringify({
            ...row.observation,
            ...observation,
            held_order_ids: heldOrderIds,
          }),
          review_required: row.review_required || requiresReview,
          updated_at: new Date(),
        });
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async releaseGroup(
    groupId: string,
    token: string,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const changed = await manager
        .getKnex()("commerce_group_state")
        .transacting(manager.getTransactionContext()!)
        .where({ id: groupId, active_token: token })
        .whereNull("deleted_at")
        .update({ active_token: null, updated_at: new Date() });
      if (changed !== 1)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce group ownership changed.",
        );
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async claimOperation(
    input: {
      groupId: string;
      token: string;
      kind: CommerceOperationRecord["kind"];
      targetId: string;
      result?: Record<string, unknown>;
    },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<CommerceOperationRecord | null> {
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const owner = await table("commerce_group_state")
        .where({ id: input.groupId, active_token: input.token })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!owner)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce group ownership changed.",
        );
      if (owner.review_required && input.kind !== "cancel") return null;
      const now = new Date();
      const [operation]: CommerceOperationRecord[] = await table(
        "commerce_operation",
      )
        .insert({
          id: `${input.kind}:${input.targetId}`,
          group_id: input.groupId,
          token: input.token,
          target_id: input.targetId,
          kind: input.kind,
          state: "processing",
          result: input.result ? JSON.stringify(input.result) : null,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore()
        .returning("*");
      return operation ?? null;
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async finishOperation(
    id: string,
    token: string,
    state: "complete" | "uncertain",
    result: Record<string, unknown>,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const changed = await manager
        .getKnex()("commerce_operation")
        .transacting(manager.getTransactionContext()!)
        .where({ id, token, state: "processing" })
        .whereNull("deleted_at")
        .update({
          state,
          result: JSON.stringify(result),
          updated_at: new Date(),
        });
      if (changed !== 1)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce operation ownership changed.",
        );
    }, Boolean(context?.transactionManager));
  }

  // The calling workflow verifies the admin/reason and holds the non-expiring writer
  // lock, including proof that the previous writer stopped. Age is never evidence.
  @InjectManager()
  async claimRecovery(
    input: ClaimRecoveryInput,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<{
    token: string;
    attempt: FinanceRecoveryAttemptRecord;
    operation: CommerceOperationRecord;
  }> {
    if (!input.actorId.trim() || input.reason.trim().length < 3) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Recovery requires an identified operator and a reason.",
      );
    }
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const observed: CommerceOperationRecord | undefined = await table(
        "commerce_operation",
      )
        .where({
          id: input.operationId,
          token: input.expectedToken,
          state: input.expectedState,
        })
        .whereNull("deleted_at")
        .first();
      if (!observed) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce operation changed before recovery.",
        );
      }
      // All financial journal writers lock the group before the operation.
      const owner: CommerceGroupRecord | undefined = await table(
        "commerce_group_state",
      )
        .where({ id: observed.group_id, active_token: input.expectedToken })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!owner) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce group ownership changed before recovery.",
        );
      }
      const otherOperation: CommerceOperationRecord | undefined = await table(
        "commerce_operation",
      )
        .where({ group_id: owner.id })
        .whereNot({ id: input.operationId })
        .whereIn("state", ["processing", "uncertain"])
        .whereNull("deleted_at")
        .first();
      if (otherOperation) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Multiple unresolved operations require group reconciliation before recovery.",
        );
      }
      const token = randomUUID();
      const now = new Date();
      const [operation]: CommerceOperationRecord[] = await table(
        "commerce_operation",
      )
        .where({
          id: input.operationId,
          group_id: owner.id,
          token: input.expectedToken,
          state: input.expectedState,
        })
        .whereNull("deleted_at")
        .update({
          token,
          state: input.expectedState === "complete" ? "complete" : "processing",
          updated_at: now,
        })
        .returning("*");
      if (!operation) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce operation changed before recovery.",
        );
      }
      const changed = await table("commerce_group_state")
        .where({ id: owner.id, active_token: input.expectedToken })
        .whereNull("deleted_at")
        .update({ active_token: token, updated_at: now });
      if (changed !== 1) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce group ownership changed before recovery.",
        );
      }
      const attemptId = randomUUID();
      await table("finance_recovery_attempt")
        .where({
          operation_id: operation.id,
          token: input.expectedToken,
          state: "processing",
        })
        .whereNull("deleted_at")
        .update({
          state: "interrupted",
          superseded_by: attemptId,
          finished_at: now,
          updated_at: now,
        });
      const [attempt]: FinanceRecoveryAttemptRecord[] = await table(
        "finance_recovery_attempt",
      )
        .insert({
          id: attemptId,
          operation_id: operation.id,
          group_id: owner.id,
          actor_id: input.actorId,
          reason: input.reason.trim(),
          prior_token: input.expectedToken,
          token,
          prior_state: input.expectedState,
          state: "processing",
          original_result: operation.result
            ? JSON.stringify(operation.result)
            : null,
          original_group: JSON.stringify(owner),
          plan: JSON.stringify(input.plan),
          observation: JSON.stringify(input.observation),
          created_at: now,
          updated_at: now,
        })
        .returning("*");
      return { token, attempt, operation };
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async checkpointRecovery(
    input: CheckpointRecoveryInput,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<{
    operation: CommerceOperationRecord;
    attempt: FinanceRecoveryAttemptRecord;
  }> {
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const audit: FinanceRecoveryAttemptRecord | undefined = await table(
        "finance_recovery_attempt",
      )
        .where({
          id: input.attemptId,
          operation_id: input.operationId,
          token: input.token,
          state: "processing",
        })
        .whereNull("deleted_at")
        .first();
      if (!audit) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Recovery attempt ownership changed.",
        );
      }
      const owner: CommerceGroupRecord | undefined = await table(
        "commerce_group_state",
      )
        .where({ id: audit.group_id, active_token: input.token })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      const operation: CommerceOperationRecord | undefined = await table(
        "commerce_operation",
      )
        .where({
          id: input.operationId,
          group_id: audit.group_id,
          token: input.token,
          state: audit.prior_state === "complete" ? "complete" : "processing",
        })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!owner || !operation) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce ownership changed during recovery.",
        );
      }
      const result = appendRecoveryFacts(operation.result ?? {}, input.result);
      if (
        audit.prior_state === "complete" &&
        JSON.stringify(result) !== JSON.stringify(operation.result ?? {})
      ) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "A completed operation only permits reconciled fence cleanup.",
        );
      }
      const now = new Date();
      const [updated]: CommerceOperationRecord[] = await table(
        "commerce_operation",
      )
        .where({ id: operation.id, token: input.token, state: operation.state })
        .whereNull("deleted_at")
        .update({ result: JSON.stringify(result), updated_at: now })
        .returning("*");
      const [attempt]: FinanceRecoveryAttemptRecord[] = await table(
        "finance_recovery_attempt",
      )
        .where({
          id: audit.id,
          operation_id: operation.id,
          token: input.token,
          state: "processing",
        })
        .whereNull("deleted_at")
        .update({
          checkpoint_result: JSON.stringify(result),
          checkpointed_at: now,
          updated_at: now,
        })
        .returning("*");
      if (!updated || !attempt) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce recovery ownership changed.",
        );
      }
      return { operation: updated, attempt };
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async finishRecovery(
    input: FinishRecoveryInput,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<{
    operation: CommerceOperationRecord;
    attempt: FinanceRecoveryAttemptRecord;
    fenceReleased: boolean;
  }> {
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const audit: FinanceRecoveryAttemptRecord | undefined = await table(
        "finance_recovery_attempt",
      )
        .where({
          id: input.attemptId,
          operation_id: input.operationId,
          token: input.token,
          state: "processing",
        })
        .whereNull("deleted_at")
        .first();
      if (!audit) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Recovery attempt ownership changed.",
        );
      }
      const owner: CommerceGroupRecord | undefined = await table(
        "commerce_group_state",
      )
        .where({ id: audit.group_id, active_token: input.token })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      const operation: CommerceOperationRecord | undefined = await table(
        "commerce_operation",
      )
        .where({
          id: input.operationId,
          group_id: audit.group_id,
          token: input.token,
          state: audit.prior_state === "complete" ? "complete" : "processing",
        })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!owner || !operation) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce ownership changed during recovery.",
        );
      }
      const result = appendRecoveryFacts(operation.result ?? {}, input.result);
      if (
        audit.prior_state === "complete" &&
        JSON.stringify(result) !== JSON.stringify(operation.result ?? {})
      ) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "A completed operation only permits reconciled fence cleanup.",
        );
      }
      const now = new Date();
      const [finished]: CommerceOperationRecord[] = await table(
        "commerce_operation",
      )
        .where({ id: operation.id, token: input.token, state: operation.state })
        .whereNull("deleted_at")
        .update({
          state: audit.prior_state === "complete" ? "complete" : input.state,
          ...(audit.prior_state === "complete"
            ? {}
            : { result: JSON.stringify(result) }),
          updated_at: now,
        })
        .returning("*");
      const otherOperation: CommerceOperationRecord | undefined = await table(
        "commerce_operation",
      )
        .where({ group_id: owner.id })
        .whereNot({ id: operation.id })
        .whereIn("state", ["processing", "uncertain"])
        .whereNull("deleted_at")
        .first();
      const observation = { ...owner.observation };
      const review = observation.finance_review;
      const ownReview =
        isRecord(review) && review.operation_id === operation.id;
      const held = observation.held_order_ids;
      const hasHolds =
        held != null && (!Array.isArray(held) || held.length > 0);
      // Unattributed legacy review context cannot safely be cleared by this operation.
      const hasOtherContext = Object.keys(observation).some(
        (key) =>
          ![
            "finance_allocation",
            "finance_final_capture",
            "finance_provider_observation",
            "finance_execution_writers",
            "finance_execution_recoveries",
            "finance_review",
            "held_order_ids",
          ].includes(key),
      );
      const hasOtherReview =
        (review != null && !ownReview) ||
        (owner.review_required && (!ownReview || hasOtherContext));
      const fenceReleased =
        input.state === "complete" &&
        !otherOperation &&
        !hasHolds &&
        !hasOtherReview;
      if (input.state === "complete" && ownReview) {
        delete observation.finance_review;
      }
      if (
        input.state === "uncertain" &&
        review == null &&
        !owner.review_required
      ) {
        observation.finance_review = { operation_id: operation.id };
      }
      const groupChanged = await table("commerce_group_state")
        .where({ id: owner.id, active_token: input.token })
        .whereNull("deleted_at")
        .update({
          active_token: fenceReleased ? null : input.token,
          review_required: !fenceReleased,
          observation: JSON.stringify(observation),
          updated_at: now,
        });
      const [attempt]: FinanceRecoveryAttemptRecord[] = await table(
        "finance_recovery_attempt",
      )
        .where({
          id: audit.id,
          operation_id: operation.id,
          token: input.token,
          state: "processing",
        })
        .whereNull("deleted_at")
        .update({
          state: input.state,
          final_result: JSON.stringify(result),
          final_observation: JSON.stringify({
            ...input.observation,
            fence_released: fenceReleased,
          }),
          finished_at: now,
          updated_at: now,
        })
        .returning("*");
      if (!finished || groupChanged !== 1 || !attempt) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Commerce recovery ownership changed.",
        );
      }
      return { operation: finished, attempt, fenceReleased };
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async recordProviderObservation(
    input: ProviderFactsObservation,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<ProviderFactsObservation> {
    const metadata = input.observation
      ? providerFinanceObservationMetadataSchema.parse(input.observation)
      : undefined;
    const coverage = providerFactCoverageSchema.parse(input.coverage);
    const facts = input.facts.map((fact) =>
      providerFinanceFactSchema.parse(fact),
    );
    const costs = input.costs.map((cost) =>
      providerFinanceCostSchema.parse(cost),
    );
    for (const fact of facts) {
      if (metadata && fact.group_id !== metadata.group_id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Provider observation contains facts from another group.",
        );
      }
      const providerKind =
        fact.kind === "authorization_release" ? "refund" : fact.kind;
      if (
        fact.key !==
        `stripe:${fact.mode}:${fact.account_id}:${providerKind}:${fact.provider_id}`
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Provider fact key does not match its identity.",
        );
      }
    }
    for (const cost of costs) {
      if (
        cost.key !==
        `stripe:${cost.mode}:${cost.account_id}:balance_transaction:${cost.balance_transaction_id}`
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Provider cost key does not match its identity.",
        );
      }
      validateProviderCost(cost);
    }
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      let savedObservation:
        ReturnType<typeof providerFinanceObservationSchema.parse> | undefined;
      let group: CommerceGroupRecord | undefined;
      let writeObservation = false;
      if (metadata) {
        group = await table("commerce_group_state")
          .where({ id: metadata.group_id })
          .whereNull("deleted_at")
          .forUpdate()
          .first();
        if (!group)
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Provider observation requires an existing commerce group.",
          );
        const next = providerFinanceObservationSchema.parse({
          ...metadata,
          observed_at: parseISO(metadata.observed_at).toISOString(),
          coverage,
        });
        const previousValue = group.observation?.finance_provider_observation;
        const previous = previousValue
          ? providerFinanceObservationSchema.parse(previousValue)
          : undefined;
        if (previous) {
          previous.observed_at = parseISO(previous.observed_at).toISOString();
          if (previous.group_id !== group.id)
            throw new MedusaError(
              MedusaError.Types.CONFLICT,
              "Provider observation group identity changed.",
            );
          const difference =
            parseISO(next.observed_at).getTime() -
            parseISO(previous.observed_at).getTime();
          if (difference === 0 && !isDeepStrictEqual(next, previous)) {
            throw new MedusaError(
              MedusaError.Types.CONFLICT,
              "Provider observations conflict at the same timestamp.",
            );
          }
          savedObservation = difference > 0 ? next : previous;
          writeObservation = difference > 0;
        } else {
          savedObservation = next;
          writeObservation = true;
        }
      }
      const savedFacts = new Map<string, ProviderFinanceFact>();
      const savedCosts = new Map<string, ProviderFinanceCost>();
      // A deterministic order also serializes competing observations without deadlocks.
      for (const fact of facts.sort((left, right) =>
        left.key.localeCompare(right.key),
      )) {
        const columns = (value: ProviderFinanceFact) => ({
          group_id: value.group_id,
          operation_id: value.operation_id,
          order_id: value.order_id,
          seller_id: value.seller_id,
          mode: value.mode,
          account_id: value.account_id,
          kind: value.kind,
          effective_at: value.effective_at,
          fact: JSON.stringify(value),
        });
        const inserted: { id: string }[] = await table("finance_provider_fact")
          .insert({ id: fact.key, ...columns(fact) })
          .onConflict("id")
          .ignore()
          .returning("id");
        if (inserted.length) {
          savedFacts.set(fact.key, fact);
          continue;
        }
        const existing: { fact: unknown } | undefined = await table(
          "finance_provider_fact",
        )
          .where({ id: fact.key })
          .whereNull("deleted_at")
          .forUpdate()
          .first();
        if (!existing) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Provider fact was archived and requires review.",
          );
        }
        const merged = mergeProviderFinanceFact(
          providerFinanceFactSchema.parse(existing.fact),
          fact,
        );
        const changed = await table("finance_provider_fact")
          .where({ id: fact.key })
          .whereNull("deleted_at")
          .update({ ...columns(merged), updated_at: new Date() });
        if (changed !== 1) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Provider fact ownership changed.",
          );
        }
        savedFacts.set(fact.key, merged);
      }
      for (const cost of costs.sort((left, right) =>
        left.key.localeCompare(right.key),
      )) {
        const inserted: { id: string }[] = await table("finance_provider_cost")
          .insert({
            id: cost.key,
            mode: cost.mode,
            account_id: cost.account_id,
            balance_transaction_id: cost.balance_transaction_id,
            cost: JSON.stringify(cost),
          })
          .onConflict("id")
          .ignore()
          .returning("id");
        if (inserted.length) {
          savedCosts.set(cost.key, cost);
          continue;
        }
        const existing: { cost: unknown } | undefined = await table(
          "finance_provider_cost",
        )
          .where({ id: cost.key })
          .whereNull("deleted_at")
          .forUpdate()
          .first();
        if (!existing) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Provider cost was archived and requires review.",
          );
        }
        const merged = mergeProviderCost(
          providerFinanceCostSchema.parse(existing.cost),
          cost,
        );
        const changed = await table("finance_provider_cost")
          .where({ id: cost.key })
          .whereNull("deleted_at")
          .update({ cost: JSON.stringify(merged), updated_at: new Date() });
        if (changed !== 1) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Provider cost ownership changed.",
          );
        }
        savedCosts.set(cost.key, merged);
      }
      if (group && savedObservation && writeObservation) {
        const changed = await table("commerce_group_state")
          .where({ id: group.id })
          .whereNull("deleted_at")
          .update({
            observation: JSON.stringify({
              ...group.observation,
              finance_provider_observation: savedObservation,
            }),
            updated_at: new Date(),
          });
        if (changed !== 1)
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Provider observation group changed.",
          );
      }
      const savedMetadata = savedObservation
        ? providerFinanceObservationMetadataSchema.parse(savedObservation)
        : undefined;
      return {
        facts: [...savedFacts.values()],
        costs: [...savedCosts.values()],
        coverage: savedObservation?.coverage ?? coverage,
        ...(savedMetadata ? { observation: savedMetadata } : {}),
      };
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async advanceScan(
    expected: string | null,
    position: string | null,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_scan")
          .transacting(manager.getTransactionContext()!);
      const now = new Date();
      await table()
        .insert({
          id: "groups",
          position: null,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore();
      await table()
        .where({ id: "groups", position: expected })
        .whereNull("deleted_at")
        .update({ position, updated_at: now });
    }, Boolean(context?.transactionManager));
  }
}

export default CommerceAutomationService;
