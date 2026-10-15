import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@medusajs/framework/pg";
import { moduleIntegrationTestRunner } from "@medusajs/test-utils";
import CommerceAutomationService, {
  readFinanceExecutionWriters,
  type ClaimRecoveryInput,
} from "../service";
import { COMMERCE_AUTOMATION_MODULE } from "../index";
import { CommerceGroupState } from "../models/commerce-group-state";
import { CommerceOperation } from "../models/commerce-operation";
import { CommerceScan } from "../models/commerce-scan";
import { FinanceSaleSnapshot } from "../models/finance-sale-snapshot";
import { FinanceRecoveryAttempt } from "../models/finance-recovery-attempt";
import { FinanceProviderFact } from "../models/finance-provider-fact";
import { FinanceProviderCost } from "../models/finance-provider-cost";
import { OrderCompletion } from "../models/order-completion";
import { VendorSettlementProjection } from "../models/vendor-settlement-projection";
import { VendorFinanceReportingProjection } from "../models/vendor-finance-reporting-projection";
import { Migration20261015212035 } from "../migrations/Migration20261015212035";
import type {
  ProviderFinanceCost,
  ProviderFinanceFact,
  ProviderFactsObservation,
} from "../../../lib/order-finance/provider-facts";

// This suite creates its own local database. It never uses a shared application's
// tables or calls Stripe. Generated migration verification remains a separate gate.
const enabled = process.env.FINANCE_JOURNAL_TESTS === "disposable-local";
if (
  enabled &&
  (process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS)
) {
  throw new Error(
    "Finance journal tests require explicitly reserved disposable localhost PostgreSQL with TLS.",
  );
}

const recordedAt = "2026-09-19T12:00:00.000Z";
const effectiveAt = "2026-09-18T12:00:00.000Z";
const reconciledAt = "2026-09-22T12:00:00.000Z";

function observation(
  groupId: string,
  mode: "test" | "live" = "test",
): ProviderFactsObservation {
  const fact: ProviderFinanceFact = {
    key: `stripe:${mode}:acct_fixture:refund:re_fixture`,
    kind: "refund",
    provider: "stripe",
    mode,
    account_id: "acct_fixture",
    group_id: groupId,
    operation_id: "refund:fixture",
    order_id: "order_fixture",
    seller_id: "seller_fixture",
    native_id: "refund_fixture",
    provider_id: "re_fixture",
    charge_id: "ch_fixture",
    payment_intent_id: "pi_fixture",
    transfer_id: null,
    destination_account_id: null,
    provider_operation_id: "refund:fixture",
    provider_order_id: "order_fixture",
    provider_seller_id: null,
    provider_transfer_group: null,
    amount_minor: 2000,
    currency_code: "usd",
    data_kind: mode === "test" ? "qa_fixture" : "ordinary",
    component_attribution: "unallocated",
    effect_status: "confirmed",
    reconciliation_status: "matched",
    effective_at: effectiveAt,
    effective_source: "stripe_event_created",
    provider_event_id: "evt_refund_succeeded",
    provider_created_at: effectiveAt,
    balance_transaction_id: "txn_fixture",
    recorded_at: recordedAt,
    reconciled_at: recordedAt,
  };
  const cost: ProviderFinanceCost = {
    key: `stripe:${mode}:acct_fixture:balance_transaction:txn_fixture`,
    provider: "stripe",
    mode,
    account_id: "acct_fixture",
    balance_transaction_id: "txn_fixture",
    source_id: "re_fixture",
    status: "pending",
    currency_code: "usd",
    amount_minor: -2000,
    fee_minor: null,
    net_minor: null,
    fee_details: null,
    provider_created_at: effectiveAt,
    available_at: null,
    recorded_at: recordedAt,
    reconciled_at: null,
    allocation: "platform_unallocated",
  };
  return {
    facts: [fact],
    costs: [cost],
    coverage: {
      complete: true,
      issues: [],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
}

if (!enabled) {
  describe.skip("financial recovery journal (real PostgreSQL)", () => {
    it("requires FINANCE_JOURNAL_TESTS=disposable-local and an explicit infrastructure reservation", () => {});
  });
} else {
  describe("financial recovery journal (real PostgreSQL)", () => {
    const dbName = `closure_finance_journal_${randomUUID().replaceAll("-", "")}`;
    moduleIntegrationTestRunner<CommerceAutomationService>({
      moduleName: COMMERCE_AUTOMATION_MODULE,
      resolve: resolve(__dirname, ".."),
      dbName,
      moduleModels: [
        OrderCompletion,
        VendorSettlementProjection,
        VendorFinanceReportingProjection,
        CommerceGroupState,
        CommerceOperation,
        CommerceScan,
        FinanceSaleSnapshot,
        FinanceRecoveryAttempt,
        FinanceProviderFact,
        FinanceProviderCost,
      ],
      testSuite: ({ service, MikroOrmWrapper }) => {
        let groupId: string;
        let input: ClaimRecoveryInput;
        beforeEach(async () => {
          const tls: { ssl: boolean }[] =
            await MikroOrmWrapper.getManager().execute(
              "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
            );
          expect(tls[0].ssl).toBe(true);
          groupId = `group_${randomUUID()}`;
          const group = await service.claimGroup(
            groupId,
            `cart_${randomUUID()}`,
          );
          const token = group!.active_token!;
          const operation = await service.claimOperation({
            groupId,
            token,
            kind: "refund",
            targetId: randomUUID(),
            result: {
              order_id: "order_fixture",
              amount: 20,
              refund_attempted: false,
              refund_ids: [],
            },
          });
          await service.finishOperation(
            operation!.id,
            token,
            "uncertain",
            operation!.result!,
          );
          await service.observeGroup(
            groupId,
            token,
            { finance_review: { operation_id: operation!.id } },
            true,
          );
          input = {
            operationId: operation!.id,
            expectedToken: token,
            expectedState: "uncertain",
            actorId: "module-test-operator",
            reason: "Verify durable recovery bookkeeping",
            plan: { steps: ["adopt-native-refund"] },
            observation: { provider_verified: true },
          };
        });

        it("admits one concurrent recovery claimant without a losing audit or mismatched owner", async () => {
          const outcomes = await Promise.allSettled(
            Array.from({ length: 8 }, () => service.claimRecovery(input)),
          );
          expect(
            outcomes.filter((outcome) => outcome.status === "fulfilled"),
          ).toHaveLength(1);
          const [attempts, count] =
            await service.listAndCountFinanceRecoveryAttempts({
              group_id: groupId,
            });
          const group = await service.retrieveCommerceGroupState(groupId);
          const operation = await service.retrieveCommerceOperation(
            input.operationId,
          );
          expect(count).toBe(1);
          expect(group.active_token).toBe(attempts[0].token);
          expect(operation.token).toBe(attempts[0].token);
        });

        it("commits concurrent execution identities, admits one atomic finance fence and audits its operation-free cleanup", async () => {
          const binding = {
            groupId: `group_${randomUUID()}`,
            cartId: `cart_${randomUUID()}`,
          };
          const writers = Array.from({ length: 6 }, (_, index) => ({
            execution_owner_id: randomUUID(),
            execution_host: "module-test-host",
            execution_pid: 100 + index,
          }));
          await Promise.all(
            writers.map((writer) =>
              service.registerFinanceExecutionWriter({ ...binding, writer }),
            ),
          );
          let group = await service.retrieveCommerceGroupState(binding.groupId);
          expect(readFinanceExecutionWriters(group.observation)).toEqual(
            expect.arrayContaining(writers),
          );
          expect(readFinanceExecutionWriters(group.observation)).toHaveLength(
            writers.length,
          );
          const claims = await Promise.all(
            writers.map((writer) =>
              service.claimFinanceGroup({
                ...binding,
                ownerId: writer.execution_owner_id,
              }),
            ),
          );
          expect(claims.filter(Boolean)).toHaveLength(1);
          group = await service.retrieveCommerceGroupState(binding.groupId);
          const owner = readFinanceExecutionWriters(group.observation).find(
            (writer) => writer.group_token === group.active_token,
          )!;
          expect(owner).toBeDefined();
          expect(owner.group_token).toBe(claims.find(Boolean)!.active_token);
          await Promise.all(
            writers.map((writer) =>
              service.removeFinanceExecutionWriter({
                ...binding,
                ownerId: writer.execution_owner_id,
              }),
            ),
          );
          group = await service.retrieveCommerceGroupState(binding.groupId);
          expect(readFinanceExecutionWriters(group.observation)).toEqual([
            owner,
          ]);
          expect(group.active_token).toBe(owner.group_token);
          const result = await service.resolveFinanceExecutionFence({
            ...binding,
            ownerId: owner.execution_owner_id,
            actorId: "module-test-operator",
            reason: "Verify stopped writer fence with no operation",
          });
          expect(result.fenceReleased).toBe(true);
          group = await service.retrieveCommerceGroupState(binding.groupId);
          expect(group.active_token).toBeNull();
          expect(group.observation?.finance_execution_recoveries).toEqual([
            expect.objectContaining({
              ...owner,
              actor_id: "module-test-operator",
              reason: "Verify stopped writer fence with no operation",
              fence_released: true,
            }),
          ]);
          await service.removeFinanceExecutionWriter({
            ...binding,
            ownerId: owner.execution_owner_id,
          });
          expect(
            readFinanceExecutionWriters(
              (await service.retrieveCommerceGroupState(binding.groupId))
                .observation,
            ),
          ).toEqual([]);
        });

        it("preserves execution identity and active fence when any claimed operation or hold prevents cleanup", async () => {
          for (const blocker of ["processing", "complete", "hold"] as const) {
            const binding = {
              groupId: `group_${randomUUID()}`,
              cartId: `cart_${randomUUID()}`,
            };
            const writer = {
              execution_owner_id: randomUUID(),
              execution_host: "module-test-host",
              execution_pid: 110,
            };
            await service.registerFinanceExecutionWriter({
              ...binding,
              writer,
            });
            const group = await service.claimFinanceGroup({
              ...binding,
              ownerId: writer.execution_owner_id,
            });
            const token = group!.active_token!;
            if (blocker === "hold")
              await service.observeGroup(
                binding.groupId,
                token,
                { held_order_ids: ["order_on_hold"] },
                false,
              );
            else {
              const operation = await service.claimOperation({
                groupId: binding.groupId,
                token,
                kind: "capture",
                targetId: randomUUID(),
                result: { amount: 20 },
              });
              if (blocker === "complete")
                await service.finishOperation(
                  operation!.id,
                  token,
                  "complete",
                  operation!.result!,
                );
            }
            await expect(
              service.resolveFinanceExecutionFence({
                ...binding,
                ownerId: writer.execution_owner_id,
                actorId: "module-test-operator",
                reason: "Verify unsafe cleanup remains blocked",
              }),
            ).rejects.toThrow("requires operation recovery");
            await service.removeFinanceExecutionWriter({
              ...binding,
              ownerId: writer.execution_owner_id,
            });
            const preserved = await service.retrieveCommerceGroupState(
              binding.groupId,
            );
            expect(preserved.active_token).toBe(token);
            expect(
              preserved.observation?.finance_execution_recoveries,
            ).toBeUndefined();
            expect(readFinanceExecutionWriters(preserved.observation)).toEqual([
              { ...writer, group_token: token },
            ]);
          }
        });

        it("persists checkpoints before the next effect and rejects a stopped writer after takeover", async () => {
          const claimed = await service.claimRecovery(input);
          await service.checkpointRecovery({
            operationId: input.operationId,
            token: claimed.token,
            attemptId: claimed.attempt.id,
            result: {
              refund_attempted: true,
              provider_refund_id: "re_verified",
            },
          });
          const persisted = await service.retrieveCommerceOperation(
            input.operationId,
          );
          expect(persisted.result).toMatchObject({
            amount: 20,
            refund_attempted: true,
            provider_refund_id: "re_verified",
          });
          const successor = await service.claimRecovery({
            ...input,
            expectedToken: claimed.token,
            expectedState: "processing",
          });
          await expect(
            service.checkpointRecovery({
              operationId: input.operationId,
              token: claimed.token,
              attemptId: claimed.attempt.id,
              result: { refund_ids: ["stale-writer"] },
            }),
          ).rejects.toThrow("ownership changed");
          const finished = await service.finishRecovery({
            operationId: input.operationId,
            token: successor.token,
            attemptId: successor.attempt.id,
            state: "complete",
            result: { refund_ids: ["refund_verified"] },
            observation: { native_verified: true },
          });
          expect(finished.fenceReleased).toBe(true);
          expect(
            (await service.retrieveCommerceGroupState(groupId)).active_token,
          ).toBeNull();
          const prior = await service.retrieveFinanceRecoveryAttempt(
            claimed.attempt.id,
          );
          expect(prior).toMatchObject({
            state: "interrupted",
            superseded_by: successor.attempt.id,
            original_result: { refund_attempted: false },
            checkpoint_result: { refund_attempted: true },
          });
        });

        it("rolls back all checkpoint writes if the audit cannot persist", async () => {
          const claimed = await service.claimRecovery(input);
          const manager = MikroOrmWrapper.getManager();
          await manager.execute(
            "alter table finance_recovery_attempt add constraint reject_test_checkpoint check (checkpoint_result is null)",
          );
          try {
            await expect(
              service.checkpointRecovery({
                operationId: input.operationId,
                token: claimed.token,
                attemptId: claimed.attempt.id,
                result: { refund_attempted: true },
              }),
            ).rejects.toThrow();
            expect(
              (await service.retrieveCommerceOperation(input.operationId))
                .result,
            ).toMatchObject({ refund_attempted: false });
            expect(
              (await service.retrieveFinanceRecoveryAttempt(claimed.attempt.id))
                .checkpoint_result,
            ).toBeNull();
          } finally {
            await manager.execute(
              "alter table finance_recovery_attempt drop constraint reject_test_checkpoint",
            );
          }
        });

        it.each(["test", "live"] as const)(
          "deduplicates concurrent %s effects/costs and retains dates when pending cost becomes confirmed",
          async (mode) => {
            const first = observation(groupId, mode);
            await Promise.all(
              Array.from({ length: 8 }, () =>
                service.recordProviderObservation(first),
              ),
            );
            const confirmed = structuredClone(first);
            confirmed.facts[0].recorded_at = reconciledAt;
            confirmed.costs[0] = {
              ...confirmed.costs[0],
              status: "confirmed",
              fee_minor: 0,
              net_minor: -2000,
              fee_details: [],
              recorded_at: reconciledAt,
              reconciled_at: reconciledAt,
            };
            const saved = await service.recordProviderObservation(confirmed);
            expect(saved.facts[0]).toMatchObject({
              effective_at: effectiveAt,
              recorded_at: recordedAt,
            });
            expect(saved.costs[0]).toMatchObject({
              status: "confirmed",
              fee_minor: 0,
              recorded_at: recordedAt,
              reconciled_at: reconciledAt,
            });
            expect(
              (
                await service.listAndCountFinanceProviderFacts({
                  group_id: groupId,
                })
              )[1],
            ).toBe(1);
            expect(
              (
                await service.listAndCountFinanceProviderCosts({
                  account_id: "acct_fixture",
                })
              )[1],
            ).toBe(1);
          },
        );

        it.each(["test", "live"] as const)(
          "rejects a conflicting %s duplicate in a batch atomically",
          async (mode) => {
            const data = observation(groupId, mode);
            data.facts.push({ ...data.facts[0], amount_minor: 2001 });
            await expect(
              service.recordProviderObservation(data),
            ).rejects.toThrow();
            expect(
              (
                await service.listAndCountFinanceProviderFacts({
                  group_id: groupId,
                })
              )[1],
            ).toBe(0);
            expect(
              (
                await service.listAndCountFinanceProviderCosts({
                  account_id: "acct_fixture",
                })
              )[1],
            ).toBe(0);
          },
        );

        it("keeps equal provider IDs in TEST and LIVE in separate durable namespaces", async () => {
          const test = observation(groupId, "test");
          const live = observation(groupId, "live");
          await Promise.all([
            service.recordProviderObservation(test),
            service.recordProviderObservation(live),
          ]);
          await service.recordProviderObservation(test);
          await service.recordProviderObservation(live);
          const facts = await service.listFinanceProviderFacts({
            group_id: groupId,
          });
          const costs = await service.listFinanceProviderCosts({
            account_id: "acct_fixture",
          });
          expect(facts.map((fact) => fact.id).sort()).toEqual([
            live.facts[0].key,
            test.facts[0].key,
          ]);
          expect(costs.map((cost) => cost.id).sort()).toEqual([
            live.costs[0].key,
            test.costs[0].key,
          ]);
          expect(facts.map((fact) => fact.mode).sort()).toEqual([
            "live",
            "test",
          ]);
          expect(costs.map((cost) => cost.mode).sort()).toEqual([
            "live",
            "test",
          ]);
        });

        it.each(["facts", "costs"] as const)(
          "rejects a %s mode/key mismatch without partial persistence",
          async (resource) => {
            const data = observation(groupId, "live");
            data[resource][0].key = data[resource][0].key.replace(
              "stripe:live:",
              "stripe:test:",
            );
            await expect(
              service.recordProviderObservation(data),
            ).rejects.toThrow();
            expect(
              await service.listFinanceProviderFacts({ group_id: groupId }),
            ).toEqual([]);
            expect(
              await service.listFinanceProviderCosts({
                account_id: "acct_fixture",
              }),
            ).toEqual([]);
          },
        );

        it("migrates Stripe modes without changing TEST evidence or RLS and refuses rollback over live or archived LIVE evidence", async () => {
          const manager = MikroOrmWrapper.getManager();
          const tables = [
            "finance_provider_cost",
            "finance_provider_fact",
            "vendor_finance_reporting_projection",
            "vendor_settlement_projection",
          ];
          for (const table of tables) {
            await manager.execute(
              `alter table "${table}" enable row level security`,
            );
            await manager.execute(
              `create policy stripe_mode_migration_fixture on "${table}" using (false)`,
            );
          }
          const security = () =>
            manager.execute<Record<string, unknown>[]>(
              `select c.relname, c.relrowsecurity, c.relforcerowsecurity, p.polname, pg_get_expr(p.polqual, p.polrelid) as policy
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             left join pg_policy p on p.polrelid = c.oid
             where n.nspname = 'public' and c.relname in ('finance_provider_cost', 'finance_provider_fact', 'vendor_finance_reporting_projection', 'vendor_settlement_projection')
             order by c.relname, p.polname`,
            );
          const constraints = () =>
            manager.execute<Array<{ table_name: string; definition: string }>>(
              `select conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as definition
             from pg_constraint where conname in ('finance_provider_cost_mode_check', 'finance_provider_fact_mode_check', 'vendor_finance_reporting_projection_mode_check', 'vendor_settlement_projection_mode_check')
             order by conname`,
            );
          const apply = async (direction: "up" | "down") => {
            const migration = new Migration20261015212035(
              undefined as never,
              undefined as never,
            );
            await migration[direction]();
            for (const sql of migration.getQueries())
              await manager.execute(String(sql));
          };
          const originalSecurity = await security();
          const test = observation(groupId);
          await service.recordProviderObservation(test);
          const originalTest = await service.listFinanceProviderFacts({
            group_id: groupId,
          });
          await apply("down");
          expect(await constraints()).toHaveLength(4);
          for (const row of await constraints())
            expect(row.definition).not.toContain("live");
          await apply("up");
          for (const row of await constraints())
            expect(row.definition).toContain("live");
          expect(
            await service.listFinanceProviderFacts({ group_id: groupId }),
          ).toEqual(originalTest);
          expect(await security()).toEqual(originalSecurity);
          const live = observation(groupId, "live");
          await service.recordProviderObservation(live);
          await expect(apply("down")).rejects.toThrow("LIVE evidence exists");
          expect(
            await service.retrieveFinanceProviderFact(live.facts[0].key),
          ).toMatchObject({ mode: "live", fact: live.facts[0] });
          await service.softDeleteFinanceProviderFacts([live.facts[0].key]);
          await service.softDeleteFinanceProviderCosts([live.costs[0].key]);
          await expect(apply("down")).rejects.toThrow("LIVE evidence exists");
          expect(await security()).toEqual(originalSecurity);
          for (const row of await constraints())
            expect(row.definition).toContain("live");
        });
      },
    });

    afterAll(async () => {
      if (!/^closure_finance_journal_[a-f0-9]{32}$/.test(dbName))
        throw new Error("Unexpected disposable database name.");
      const control = new Client({
        host: "localhost",
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: "postgres",
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 10000,
      });
      await control.connect();
      try {
        await control.query(`drop database if exists "${dbName}"`);
      } finally {
        await control.end();
      }
    });
  });
}
