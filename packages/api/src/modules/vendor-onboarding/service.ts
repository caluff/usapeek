import { randomUUID } from "node:crypto";
import { InjectManager, MedusaContext, MedusaService } from "@medusajs/framework/utils";
import type { Context, InferTypeOf, DAL } from "@medusajs/framework/types";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { VendorApplication } from "./models/vendor-application";
import { VendorApplicationEvent } from "./models/vendor-application-event";
import { VendorApplicationMutation } from "./models/vendor-application-mutation";
import { VendorWarehouse } from "./models/vendor-warehouse";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";

export type ApplicationRecord = InferTypeOf<typeof VendorApplication>;
export type MutationRecord = InferTypeOf<typeof VendorApplicationMutation>;
export type WarehouseRecord = InferTypeOf<typeof VendorWarehouse>;
type AtomicInput = {
  customer_id: string; auth_identity_id: string; actor_id: string; applicant_email: string;
  mutation_id: string; request_hash: string; expected_version: number; operation: string; transaction_id: string;
  application_id?: string; allowed_statuses: ApplicationRecord["status"][];
  update: Partial<ApplicationRecord>; event?: { type: "submitted" | "changes_requested" | "approved" | "rejected"; reason: string | null; reviewer_id: string | null };
  claim_approval?: boolean;
};

class VendorOnboardingService extends MedusaService({ VendorApplication, VendorApplicationEvent, VendorApplicationMutation, VendorWarehouse }) {
  protected baseRepository_: DAL.RepositoryService;
  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(container);
    this.baseRepository_ = container.baseRepository;
  }
  @InjectManager()
  async listApplicationQueue(input: { status: ApplicationRecord["status"]; q?: string; limit: number; offset: number }, @MedusaContext() context?: Context<EntityManager>): Promise<[ApplicationRecord[], number]> {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      const table = manager.getKnex()("vendor_application").transacting(manager.getTransactionContext()!).where({ status: input.status }).whereNull("deleted_at");
      if (input.q) {
        const search = `%${input.q.replace(/[\\%_]/g, "\\$&")}%`;
        table.andWhereRaw("(data->'store'->>'name' ilike ? or applicant_email ilike ?)", [search, search]);
      }
      const count = await table.clone().count("id as count").first();
      const rows = await table.orderBy("submitted_at").orderBy("id").limit(input.limit).offset(input.offset);
      return [rows, Number(count?.count || 0)];
    }, { transaction: context?.transactionManager });
  }
  // The row lock, compare-and-swap, journal, and event share one module transaction.
  @InjectManager()
  async atomicMutation(input: AtomicInput, @MedusaContext() context?: Context<EntityManager>) {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      await manager.execute("select pg_advisory_xact_lock(hashtext(?))", [`vendor-application:${input.customer_id}`]);
      const knex = manager.getKnex();
      const trx = manager.getTransactionContext()!;
      const table = (name: string) => knex(name).transacting(trx);
      const previous: MutationRecord | undefined = await table("vendor_application_mutation").where({ customer_id: input.customer_id, mutation_id: input.mutation_id }).first();
      if (previous) {
        if (previous.actor_id !== input.actor_id || previous.request_hash !== input.request_hash || previous.operation !== input.operation) throw new OnboardingError("mutation_conflict");
        if (previous.state === "failed") throw new OnboardingError(previous.error_code || "approval_failed");
        return { application: previous.result as ApplicationRecord | null, mutation: previous, replay: true };
      }
      let application: ApplicationRecord | undefined = await table("vendor_application").where({ customer_id: input.customer_id }).forUpdate().first();
      if (application && (application.auth_identity_id !== input.auth_identity_id || (input.application_id && application.id !== input.application_id))) throw new OnboardingError("identity_changed");
      if ((application?.version ?? 0) !== input.expected_version) throw new OnboardingError("version_conflict");
      if (application?.approval_state === "processing") throw new OnboardingError("approval_in_progress");
      if (application && !input.allowed_statuses.includes(application.status)) throw new OnboardingError("invalid_transition");
      if (!application && input.operation !== "save") throw new OnboardingError("application_not_found", 404);
      const now = new Date();
      const mutationId = `vappmut_${randomUUID()}`;
      const update = { ...input.update, updated_at: now, version: input.claim_approval ? input.expected_version : input.expected_version + 1 };
      if (input.claim_approval) Object.assign(update, { approval_state: "processing", approval_operation_id: mutationId, approval_error_code: null });
      if (!application) {
        [application] = await table("vendor_application").insert({ id: `vapp_${randomUUID()}`, customer_id: input.customer_id, auth_identity_id: input.auth_identity_id, applicant_email: input.applicant_email, created_at: now, ...update }).returning("*");
      } else {
        [application] = await table("vendor_application").where({ id: application.id, version: input.expected_version }).update(update).returning("*");
      }
      if (!application) throw new OnboardingError("version_conflict");
      if (input.event) await table("vendor_application_event").insert({ id: `vappevt_${randomUUID()}`, application_id: application.id, customer_id: input.customer_id, ...input.event, submission_revision: application.submission_revision, submitted_data: application.submitted_data, created_at: now, updated_at: now });
      const [mutation]: MutationRecord[] = await table("vendor_application_mutation").insert({ id: mutationId, application_id: application.id, customer_id: input.customer_id, mutation_id: input.mutation_id, actor_id: input.actor_id, request_hash: input.request_hash, expected_version: input.expected_version, operation: input.operation, state: input.claim_approval ? "processing" : "complete", transaction_id: input.transaction_id, result: application, created_at: now, updated_at: now }).returning("*");
      return { application, mutation, replay: false };
    }, { transaction: context?.transactionManager });
  }

  @InjectManager()
  async fenceApproval(operationId: string, update: { member_id?: string; seller_id?: string; created_member?: boolean; warehouse_id?: string; warehouse_ready?: boolean; complete?: boolean; failed?: boolean }, @MedusaContext() context?: Context<EntityManager>) {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      const table = (name: string) => manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const mutation: MutationRecord = await table("vendor_application_mutation").where({ id: operationId }).forUpdate().first();
      if (!mutation) throw new OnboardingError("approval_in_progress");
      const application: ApplicationRecord = await table("vendor_application").where({ id: mutation.application_id }).forUpdate().first();
      if (mutation.state !== "processing" || application.approval_operation_id !== operationId || application.version !== mutation.expected_version || application.status !== "submitted") throw new OnboardingError("approval_in_progress");
      const now = new Date();
      const { complete, failed, ...ids } = update;
      for (const key of ["member_id", "seller_id", "warehouse_id"] as const) {
        if (mutation[key] && ids[key] && mutation[key] !== ids[key]) throw new OnboardingError("approval_recovery_required");
      }
      await table("vendor_application_mutation").where({ id: operationId }).update({ ...ids, updated_at: now });
      if (complete) {
        if (!mutation.member_id || !mutation.seller_id || !mutation.warehouse_id || !mutation.warehouse_ready) throw new OnboardingError("approval_in_progress");
        const warehouse = await table("vendor_warehouse").where({ id: mutation.warehouse_id, seller_id: mutation.seller_id, operation_id: operationId, state: "ready" }).whereNull("deleted_at").first();
        if (!warehouse) throw new OnboardingError("approval_recovery_required");
        const review = { decision: "approve", reason: null, created_at: now.toISOString() };
        const [result] = await table("vendor_application").where({ id: application.id, version: mutation.expected_version, approval_operation_id: operationId }).update({ seller_id: mutation.seller_id, member_id: mutation.member_id, status: "approved", approval_state: "complete", version: application.version + 1, reviewed_at: now, updated_at: now, review }).returning("*");
        await table("vendor_application_event").insert({ id: `vappevt_${randomUUID()}`, application_id: application.id, customer_id: application.customer_id, type: "approved", reviewer_id: mutation.actor_id, submission_revision: application.submission_revision, submitted_data: application.submitted_data, created_at: now, updated_at: now });
        await table("vendor_application_mutation").where({ id: operationId }).update({ state: "complete", result, updated_at: now });
      } else if (failed) {
        const retained = await table("vendor_warehouse").where({ operation_id: operationId }).whereNot({ state: "released" }).first();
        if (retained) throw new OnboardingError("approval_recovery_required");
        await table("vendor_application").where({ id: application.id }).update({ approval_state: "failed", approval_error_code: "approval_failed", approval_operation_id: null, updated_at: now });
        await table("vendor_application_mutation").where({ id: operationId }).update({ state: "failed", error_code: "approval_failed", updated_at: now });
      }
      return { application, mutation };
    }, { transaction: context?.transactionManager });
  }

  @InjectManager()
  async claimWarehouse(input: Omit<WarehouseRecord, "created_at" | "updated_at" | "deleted_at" | "state">, @MedusaContext() context?: Context<EntityManager>): Promise<WarehouseRecord> {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      const table = (name: string) => manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const mutation: MutationRecord = await table("vendor_application_mutation").where({ id: input.operation_id }).forUpdate().first();
      const application: ApplicationRecord = await table("vendor_application").where({ id: input.application_id }).forUpdate().first();
      if (!mutation || !application || mutation.application_id !== application.id || application.approval_operation_id !== input.operation_id || application.submission_revision !== input.submission_revision || mutation.seller_id !== input.seller_id || !["processing", "complete"].includes(mutation.state) || (mutation.state === "processing" ? application.status !== "submitted" || application.approval_state !== "processing" || application.version !== mutation.expected_version : application.status !== "approved" || application.approval_state !== "complete" || application.seller_id !== input.seller_id)) throw new OnboardingError("approval_recovery_required");
      await table("vendor_warehouse").insert({ ...input, state: "provisioning", created_at: new Date(), updated_at: new Date() }).onConflict("seller_id").ignore();
      const claim: WarehouseRecord = await table("vendor_warehouse").where({ seller_id: input.seller_id }).first();
      if (claim.operation_id !== input.operation_id || claim.application_id !== input.application_id || claim.submission_revision !== input.submission_revision || claim.state === "released" || claim.deleted_at) throw new OnboardingError("warehouse_conflict");
      if (mutation.state === "processing") {
        if (mutation.warehouse_id && mutation.warehouse_id !== claim.id) throw new OnboardingError("approval_recovery_required");
        await table("vendor_application_mutation").where({ id: mutation.id }).update({ warehouse_id: claim.id, updated_at: new Date() });
      }
      return claim;
    }, { transaction: context?.transactionManager });
  }

  @InjectManager()
  async markNotificationsRead(customerId: string, ids: string[], @MedusaContext() context?: Context<EntityManager>) {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      const table = () => manager.getKnex()("vendor_application_event").transacting(manager.getTransactionContext()!);
      const rows = await table().whereIn("id", [...new Set(ids)]).where({ customer_id: customerId }).forUpdate();
      if (rows.length !== new Set(ids).size) throw new OnboardingError("notification_not_found", 404);
      await table().whereIn("id", ids).where({ customer_id: customerId }).whereNull("read_at").update({ read_at: new Date() });
    }, { transaction: context?.transactionManager });
  }

  @InjectManager()
  async reserveVerification(customerId: string, ipHash: string, @MedusaContext() context?: Context<EntityManager>) {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      await manager.execute("select pg_advisory_xact_lock(hashtext(?))", ["vendor-verification-rate-limit"]);
      const table = () => manager.getKnex()("vendor_application_mutation").transacting(manager.getTransactionContext()!);
      const recent = await table().where({ operation: "verification" }).where("created_at", ">", new Date(Date.now() - 3600_000)).andWhere(builder => builder.where({ customer_id: customerId }).orWhere({ request_hash: ipHash }));
      const own = recent.filter(row => row.customer_id === customerId);
      if (own.length >= 5 || recent.filter(row => row.request_hash === ipHash).length >= 20 || own.some(row => new Date(row.created_at).getTime() > Date.now() - 60_000)) throw new OnboardingError("verification_rate_limited", 429);
      const id = randomUUID();
      await table().insert({ id: `vappmut_${id}`, application_id: `verification:${customerId}`, customer_id: customerId, mutation_id: id, actor_id: customerId, request_hash: ipHash, expected_version: 0, operation: "verification", state: "complete", transaction_id: id, created_at: new Date(), updated_at: new Date() });
    }, { transaction: context?.transactionManager });
  }

  @InjectManager()
  async claimEmailEvent(@MedusaContext() context?: Context<EntityManager>) {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      const table = manager.getKnex()("vendor_application_event").transacting(manager.getTransactionContext()!);
      const event = await table.clone().where("email_attempts", "<", 5).where(builder => builder.whereIn("email_state", ["pending", "unconfigured", "failed"]).orWhere(inner => inner.where({ email_state: "processing" }).where("email_claimed_at", "<", new Date(Date.now() - 300_000)))).orderBy("created_at").forUpdate().skipLocked().first();
      if (!event) return null;
      const claimedAt = new Date();
      await table.clone().where({ id: event.id }).update({ email_state: "processing", email_attempts: event.email_attempts + 1, email_claimed_at: claimedAt });
      return { ...event, email_claimed_at: claimedAt } as InferTypeOf<typeof VendorApplicationEvent>;
    }, { transaction: context?.transactionManager });
  }

  @InjectManager()
  async finishEmailEvent(id: string, claimedAt: Date, state: "sent" | "failed", @MedusaContext() context?: Context<EntityManager>) {
    return this.baseRepository_.transaction(async (manager: EntityManager) => {
      await manager.getKnex()("vendor_application_event").transacting(manager.getTransactionContext()!).where({ id, email_state: "processing", email_claimed_at: claimedAt }).update({ email_state: state });
    }, { transaction: context?.transactionManager });
  }
}
export default VendorOnboardingService;
