import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@medusajs/framework/pg";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { moduleIntegrationTestRunner } from "@medusajs/test-utils";
import CommerceAutomationService from "../service";
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
import { Migration20261003235121 } from "../migrations/Migration20261003235121";
import {
  saveSettlementGroupProjection,
  type SettlementProjection,
  type SettlementSourceRow,
} from "../vendor-settlements";

const enabled = process.env.AUTOMATIC_SETTLEMENT_TESTS === "disposable-local";
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
    "Registry tests require reserved disposable localhost PostgreSQL with TLS.",
  );
}

function projection(
  source: SettlementSourceRow,
  patch: Partial<SettlementProjection> = {},
): SettlementProjection {
  return {
    id: source.id,
    seller_id: source.seller_id,
    group_id: source.group_id,
    cart_id: source.cart_id,
    status: "waiting",
    data_kind: "ordinary",
    pending_amount: 64.4,
    projection: {
      order_display_id: 16,
      order_custom_display_id: "PED-16",
      reason: null,
    },
    ...patch,
  };
}

if (!enabled) {
  describe.skip("vendor settlement registry (real PostgreSQL)", () => {
    it("requires the reserved disposable infrastructure", () => {});
  });
} else {
  const dbName = `closure_settlement_registry_${randomUUID().replaceAll("-", "")}`;
  moduleIntegrationTestRunner<CommerceAutomationService>({
    moduleName: COMMERCE_AUTOMATION_MODULE,
    resolve: resolve(__dirname, ".."),
    dbName,
    moduleModels: [
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
    ],
    hooks: {
      beforeModuleInit: async () => {
        const connection = new Client({
          host: "localhost",
          port: 55432,
          user: "closure_test",
          password: process.env.DB_PASSWORD,
          database: dbName,
          ssl: { rejectUnauthorized: true },
        });
        try {
          await connection.connect();
          const migration = new Migration20261003235121(
            undefined as never,
            undefined as never,
          );
          await migration.up();
          await connection.query("begin");
          for (const sql of migration.getQueries())
            await connection.query(String(sql));
          await connection.query("commit");
        } catch (error) {
          await connection.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          await connection.end();
        }
      },
    },
    testSuite: ({ service, MikroOrmWrapper }) => {
      const now = new Date();
      const read = (
        sellerId = "seller_own",
        patch: {
          limit?: number;
          offset?: number;
          data_kind?: "ordinary" | "qa_fixture";
          now?: Date;
        } = {},
      ) =>
        service.readVendorSettlements({
          seller_id: sellerId,
          data_kind: "ordinary",
          limit: 10,
          offset: 0,
          now,
          ...patch,
        });
      async function seed(
        ids = ["order_own"],
        seller = "seller_own",
        group = "group_own",
        delayDays = 3,
      ) {
        const manager = MikroOrmWrapper.getManager();
        await manager.execute(
          "insert into commerce_group_state (id, cart_id, observation) values (?, ?, '{}'::jsonb)",
          [group, `cart_${group}`],
        );
        for (const id of ids)
          await manager.execute(
            `insert into order_completion (id, seller_id, group_id, cart_id, completed_at, eligible_at, observed_order_updated_at, registration_token, release_delay_days)
          values (?, ?, ?, ?, ?::timestamptz, ?::timestamptz + (? * interval '24 hours'), ?::timestamptz, ?, ?)`,
            [
              id,
              seller,
              group,
              `cart_${group}`,
              now,
              now,
              delayDays,
              now,
              randomUUID(),
              delayDays,
            ],
          );
        return service.readVendorSettlementGroupSource(group);
      }
      async function save(
        source: SettlementSourceRow[],
        patches: Partial<SettlementProjection>[] = [],
      ) {
        return service.saveVendorSettlementProjection({
          source,
          projections: source.map((row, index) =>
            projection(row, patches[index]),
          ),
          refreshed_at: now,
        });
      }
      beforeEach(async () => {
        const rows: { ssl: boolean }[] =
          await MikroOrmWrapper.getManager().execute(
            "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
          );
        expect(rows[0].ssl).toBe(true);
      });

      it.each([0, 1, 2, 3])(
        "carries the %i-day immutable snapshot into projection sources and vendor dates",
        async (days) => {
          const [source] = await seed(
            ["order_delay"],
            "seller_own",
            "group_delay",
            days,
          );
          expect(source.release_delay_days).toBe(days);
          expect(
            source.eligible_at.getTime() - source.completed_at.getTime(),
          ).toBe(days * 86_400_000);
          expect(await save([source])).toBe(true);
          const result = await read();
          expect(result.items[0].eligible_at).toEqual(source.eligible_at);
          expect(result.next_release_at).toEqual(source.eligible_at);
        },
      );

      it("rejects a changed delay snapshot in projection input without changing saved data", async () => {
        const source = await seed();
        expect(await save(source)).toBe(true);
        const before = await read();
        const changed = source.map((row) => ({
          ...row,
          release_delay_days: 0,
        }));
        expect(await save(changed, [{ pending_amount: 0 }])).toBe(false);
        expect(await read()).toEqual(before);
      });

      it("shows completion before its first refresh, scopes sellers and totals before pagination", async () => {
        const source = await seed(["order_a", "order_b"]);
        await seed(["order_foreign"], "seller_foreign", "group_foreign");
        expect(await read()).toMatchObject({
          count: 2,
          total_pending: null,
          unknown_amount_count: 2,
        });
        expect(await save(source)).toBe(true);
        const page = await read("seller_own", { limit: 1, offset: 1 });
        expect(page).toMatchObject({
          count: 2,
          total_pending: 128.8,
          unknown_amount_count: 0,
        });
        expect(page.items.map((row) => row.order_id)).toEqual(["order_b"]);
        expect(page.items[0].pending_amount).toBe(64.4);
        expect(
          (await read("seller_foreign")).items.map((row) => row.order_id),
        ).toEqual(["order_foreign"]);
      });

      it("keeps processing and unknown review amounts visible without a misleading total", async () => {
        const source = await seed(["order_a", "order_b"]);
        await save(source, [
          { status: "processing", pending_amount: null },
          { status: "needs_review", pending_amount: null },
        ]);
        expect(await read()).toMatchObject({
          count: 2,
          total_pending: null,
          unknown_amount_count: 2,
          next_release_at: null,
        });
        expect((await read()).items.map((row) => row.status)).toEqual([
          "processing",
          "needs_review",
        ]);
      });

      it("excludes final rows without periodically rereading history, but exposes them after refund state changes", async () => {
        const source = await seed();
        await save(source, [{ status: "released", pending_amount: 0 }]);
        const later = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
        expect(await read("seller_own", { now: later })).toMatchObject({
          count: 0,
          total_pending: 0,
        });
        expect(
          await service.listDirtyVendorSettlementGroups({
            take: 5,
            now: later,
          }),
        ).toEqual([]);
        await MikroOrmWrapper.getManager().execute(
          "update commerce_group_state set observation = '{\"refund\":true}'::jsonb where id = 'group_own'",
        );
        expect(await read()).toMatchObject({
          count: 1,
          total_pending: null,
          unknown_amount_count: 1,
        });
      });

      it("detects semantic provider fact changes with unchanged timestamps and rejects the old CAS", async () => {
        await seed();
        const manager = MikroOrmWrapper.getManager();
        await manager.execute(
          "insert into finance_provider_fact (id, group_id, mode, account_id, kind, fact) values ('fact_test', 'group_own', 'test', 'acct_test', 'capture', '{\"data_kind\":\"unknown\"}'::jsonb)",
        );
        const before =
          await service.readVendorSettlementGroupSource("group_own");
        await save(before);
        await manager.execute(
          "update finance_provider_fact set fact = '{\"data_kind\":\"ordinary\"}'::jsonb where id = 'fact_test'",
        );
        const after =
          await service.readVendorSettlementGroupSource("group_own");
        expect(after[0].source_revision).not.toBe(before[0].source_revision);
        expect(await save(before)).toBe(false);
        expect(await read()).toMatchObject({
          total_pending: null,
          unknown_amount_count: 1,
        });
      });

      it("keeps known QA classification through stale state and a failed refresh", async () => {
        const source = await seed();
        await save(source, [{ data_kind: "qa_fixture" }]);
        await service.invalidateVendorSettlements(["order_own"]);
        expect((await read()).count).toBe(0);
        expect(
          (await read("seller_own", { data_kind: "qa_fixture" }))
            .unknown_amount_count,
        ).toBe(1);
        await save(await service.readVendorSettlementGroupSource("group_own"), [
          {
            data_kind: "unknown",
            status: "needs_review",
            pending_amount: null,
          },
        ]);
        expect((await read()).count).toBe(0);
        expect(
          (await read("seller_own", { data_kind: "qa_fixture" })).count,
        ).toBe(1);
      });

      it("rolls back all projections when a later insertion fails a real database constraint", async () => {
        const source = await seed(["order_a", "order_b"]);
        await expect(
          save(source, [{}, { status: "released", pending_amount: 64.4 }]),
        ).rejects.toThrow();
        const stored: { count: string }[] =
          await MikroOrmWrapper.getManager().execute(
            "select count(*) from vendor_settlement_projection",
          );
        expect(Number(stored[0].count)).toBe(0);
        expect((await read()).unknown_amount_count).toBe(2);
      });

      it.each([false, true])(
        "preserves concurrent invalidation when a projection previously exists: %s",
        async (existing) => {
          const source = await seed();
          if (existing) await save(source);
          const expected =
            await service.readVendorSettlementGroupSource("group_own");
          const knex = MikroOrmWrapper.getManager().getKnex();
          let reached!: () => void;
          let proceed!: () => void;
          const atCompare = new Promise<void>((resolveCompare) => {
            reached = resolveCompare;
          });
          const canCommit = new Promise<void>((resolveCommit) => {
            proceed = resolveCommit;
          });
          const saving = knex.transaction(async (transaction) => {
            const wrapped = new Proxy(transaction, {
              get(target, name, receiver) {
                if (name !== "raw") return Reflect.get(target, name, receiver);
                return async (sql: string, bindings: never) => {
                  const result = await target.raw(sql, bindings);
                  if (
                    sql.includes("current_source_revision as source_revision")
                  ) {
                    reached();
                    await canCommit;
                  }
                  return result;
                };
              },
            });
            const manager = {
              getKnex: () => knex,
              getTransactionContext: () => wrapped,
            } as EntityManager;
            return saveSettlementGroupProjection(manager, {
              source: expected,
              projections: expected.map((row) => projection(row)),
              refreshed_at: now,
            });
          });
          await atCompare;
          const invalidating = service.invalidateVendorSettlements([
            "order_own",
          ]);
          // Let a separate connection enter invalidation while completion rows are locked.
          await knex.raw("select pg_sleep(0.05)");
          proceed();
          expect(await saving).toBe(true);
          await invalidating;
          expect(await read()).toMatchObject({
            count: 1,
            total_pending: null,
            unknown_amount_count: 1,
          });
          const after =
            await service.readVendorSettlementGroupSource("group_own");
          expect(after[0].invalidation_token).not.toBe(
            expected[0].invalidation_token,
          );
        },
      );
    },
  });
}
