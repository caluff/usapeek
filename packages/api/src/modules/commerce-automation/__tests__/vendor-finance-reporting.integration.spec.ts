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
import { Migration20261004012955 } from "../migrations/Migration20261004012955";
import {
  registerReportingReferences,
  saveReportingGroupProjection,
  type ReportingSource,
} from "../vendor-finance-reporting";

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
)
  throw new Error(
    "Reporting registry tests require reserved disposable localhost PostgreSQL with TLS.",
  );

function verifiedEmptySources() {
  return {
    facts: [],
    costs: [],
    capture_allocations: [],
    refund_adjustments: [],
    coverage: {
      complete: true,
      issues: [],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
}
if (!enabled) {
  describe.skip("vendor reporting registry (real PostgreSQL)", () => {
    it("requires reserved disposable infrastructure", () => {});
  });
} else {
  const dbName = `closure_reporting_registry_${randomUUID().replaceAll("-", "")}`;
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
          const migration = new Migration20261004012955(
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
      const read = (seller_id = "seller_own", date = now) =>
        service.readVendorFinanceReportingRegistry({ seller_id, now: date });
      async function seed(
        ids = ["order_own"],
        group = "group_own",
        seller = "seller_own",
        originalOnly = false,
      ) {
        const manager = MikroOrmWrapper.getManager();
        await manager.execute(
          "insert into commerce_group_state (id, cart_id, observation) values (?, ?, '{}'::jsonb)",
          [group, `cart_${group}`],
        );
        for (const id of ids)
          if (originalOnly)
            await manager.execute(
              "insert into finance_sale_snapshot (id, seller_id, group_id, cart_id, currency_code, original) values (?, ?, ?, ?, 'usd', '{}'::jsonb)",
              [id, seller, group, `cart_${group}`],
            );
        if (!originalOnly)
          await service.registerVendorReportingReferences(
            ids.map((id) => ({
              id,
              seller_id: seller,
              group_id: group,
              cart_id: `cart_${group}`,
              native_revision: "native_v1",
              order_display_id: 16,
              order_custom_display_id: null,
            })),
          );
        return service.readVendorReportingGroupSource(group);
      }
      const save = (source: ReportingSource[], refreshed_at = now) =>
        service.saveVendorReportingProjection({
          source,
          projections: source.map((row) => ({
            id: row.id,
            sources: verifiedEmptySources(),
          })),
          refreshed_at,
        });

      it("includes originals before discovery and scopes every row to its seller", async () => {
        await seed(["order_own"], "group_own", "seller_own", true);
        await seed(["order_other"], "group_other", "seller_other", true);
        const result = await read();
        expect(result.rows.map((row) => row.id)).toEqual(["order_own"]);
        expect(result.rows[0].is_fresh).toBe(false);
        expect(result.discovery.complete).toBe(false);
        expect((await read("seller_absent")).rows).toEqual([]);
      });
      it("keeps unchanged verified readings available after age expiry, including more than 10 groups", async () => {
        for (let index = 0; index < 21; index++) {
          const source = await seed([`order_${index}`], `group_${index}`);
          await save(source, new Date(now.getTime() - 60 * 60 * 1000));
        }
        const result = await read(
          "seller_own",
          new Date(now.getTime() + 60 * 60 * 1000),
        );
        expect(result.rows).toHaveLength(21);
        expect(result.rows.every((row) => row.is_fresh)).toBe(true);
        expect(await service.listDirtyVendorReportingGroups()).toHaveLength(1);
      });
      it("detects semantically changed or deleted facts even with unchanged timestamps and rejects an old CAS", async () => {
        await seed();
        const manager = MikroOrmWrapper.getManager();
        await manager.execute(
          "insert into finance_provider_fact (id, group_id, mode, account_id, kind, fact) values ('fact_test', 'group_own', 'test', 'acct_test', 'capture', '{\"amount\":1}'::jsonb)",
        );
        const before =
          await service.readVendorReportingGroupSource("group_own");
        expect(await save(before)).toBe(true);
        await manager.execute(
          "update finance_provider_fact set fact = '{\"amount\":2}'::jsonb where id = 'fact_test'",
        );
        expect(await save(before)).toBe(false);
        expect((await read()).rows[0].is_fresh).toBe(false);
        const refreshed =
          await service.readVendorReportingGroupSource("group_own");
        await save(refreshed);
        await manager.execute(
          "update finance_provider_fact set deleted_at = now() where id = 'fact_test'",
        );
        expect((await read()).rows[0].is_fresh).toBe(false);
      });
      it("stores reviewed sources as evaluated so a held group does not starve another expired group", async () => {
        await seed();
        await MikroOrmWrapper.getManager().execute(
          "update commerce_group_state set review_required = true where id = 'group_own'",
        );
        const held = await service.readVendorReportingGroupSource("group_own");
        expect(held[0].unsafe).toBe(true);
        await save(held);
        const other = await seed(["order_other"], "group_other");
        await save(other, new Date(now.getTime() - 60 * 60 * 1000));
        expect(
          (await read()).rows.find((row) => row.id === "order_own")?.is_fresh,
        ).toBe(true);
        expect(await service.listDirtyVendorReportingGroups()).toEqual([
          "group_other",
        ]);
      });
      it("keeps discovery progress durable, wraps cursors, and preserves source/token for unchanged native scans", async () => {
        const initial = await service.readVendorReportingDiscovery();
        const references = [
          {
            id: "order_own",
            seller_id: "seller_own",
            group_id: "group_own",
            cart_id: "cart_group_own",
            native_revision: "v1",
            order_display_id: 16,
            order_custom_display_id: null,
          },
        ];
        expect(
          await service.saveVendorReportingDiscovery({
            references,
            expected: initial,
            next: { cursor: "group_own", complete: false },
          }),
        ).toBe(true);
        expect(
          await service.saveVendorReportingDiscovery({
            references: [],
            expected: initial,
            next: { cursor: null, complete: true },
          }),
        ).toBe(false);
        const source =
          await service.readVendorReportingGroupSource("group_own");
        await save(source);
        const before = (await read()).rows[0];
        await service.registerVendorReportingReferences(references);
        expect((await read()).rows[0]).toEqual(before);
        expect(
          await service.saveVendorReportingDiscovery({
            references: [],
            expected: { cursor: "group_own", complete: false },
            next: { cursor: null, complete: true },
          }),
        ).toBe(true);
        expect(await service.readVendorReportingDiscovery()).toEqual({
          cursor: null,
          complete: true,
        });
      });
      it("rejects changed ownership before changing any row in a registration batch", async () => {
        await seed(["order_a", "order_b"]);
        const refs = (
          await service.readVendorReportingGroupSource("group_own")
        ).map(
          ({
            source_revision: _source,
            invalidation_token: _token,
            unsafe: _unsafe,
            ...reference
          }) => reference,
        );
        refs[0].native_revision = "new";
        refs[1].seller_id = "seller_other";
        await expect(
          service.registerVendorReportingReferences(refs),
        ).rejects.toThrow();
        expect(
          (await service.readVendorReportingGroupSource("group_own")).every(
            (row) => row.native_revision === "native_v1",
          ),
        ).toBe(true);
      });
      it("rejects conflicting concurrent first registrations without overwriting immutable ownership", async () => {
        const knex = MikroOrmWrapper.getManager().getKnex();
        let reads = 0;
        let release!: () => void;
        const bothReadMissing = new Promise<void>((done) => {
          release = done;
        });
        const register = (seller_id: string) =>
          knex.transaction(async (transaction) => {
            const wrapped = new Proxy(transaction, {
              apply(target, receiver, argumentsList) {
                const queryBuilder = Reflect.apply(
                  target,
                  receiver,
                  argumentsList,
                );
                if (
                  argumentsList[0] === "vendor_finance_reporting_projection"
                ) {
                  const select = queryBuilder.select.bind(queryBuilder);
                  queryBuilder.select = (...fields: string[]) => {
                    const result = select(...fields);
                    if (fields[0] !== "*") return result;
                    return result.then(async (rows: unknown[]) => {
                      reads++;
                      if (reads === 2) release();
                      await bothReadMissing;
                      return rows;
                    });
                  };
                }
                return queryBuilder;
              },
            });
            const manager = {
              getKnex: () => knex,
              getTransactionContext: () => wrapped,
            } as EntityManager;
            await registerReportingReferences(manager, [
              {
                id: "order_race",
                seller_id,
                group_id: "group_race",
                cart_id: "cart_race",
                native_revision: "native",
                order_display_id: 17,
                order_custom_display_id: null,
              },
            ]);
          });
        const outcomes = await Promise.allSettled([
          register("seller_a"),
          register("seller_b"),
        ]);
        expect(
          outcomes.filter((outcome) => outcome.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          outcomes.filter((outcome) => outcome.status === "rejected"),
        ).toHaveLength(1);
        const winner =
          outcomes[0].status === "fulfilled" ? "seller_a" : "seller_b";
        expect((await read(winner)).rows.map((row) => row.seller_id)).toEqual([
          winner,
        ]);
        expect(
          (await read(winner === "seller_a" ? "seller_b" : "seller_a")).rows,
        ).toEqual([]);
      });
      it("rolls back every projection when a later write fails a real PostgreSQL constraint", async () => {
        const source = await seed(["order_a", "order_b"]);
        const manager = MikroOrmWrapper.getManager();
        await manager.execute(
          "alter table vendor_finance_reporting_projection add constraint reporting_rollback_probe check (id <> 'order_b' or sources is null)",
        );
        try {
          await expect(save(source)).rejects.toThrow();
          expect(
            (await read()).rows.every(
              (row) => !row.is_fresh && row.sources === null,
            ),
          ).toBe(true);
        } finally {
          await manager.execute(
            "alter table vendor_finance_reporting_projection drop constraint reporting_rollback_probe",
          );
        }
      });
      it.each([false, true])(
        "preserves concurrent invalidation during the first or later projection save: %s",
        async (existing) => {
          const original = await seed(
            ["order_own"],
            "group_own",
            "seller_own",
            !existing,
          );
          if (existing) await save(original);
          const expected =
            await service.readVendorReportingGroupSource("group_own");
          const knex = MikroOrmWrapper.getManager().getKnex();
          let reached!: () => void;
          let proceed!: () => void;
          const compared = new Promise<void>((done) => {
            reached = done;
          });
          const permissionToCommit = new Promise<void>((done) => {
            proceed = done;
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
                    await permissionToCommit;
                  }
                  return result;
                };
              },
            });
            const manager = {
              getKnex: () => knex,
              getTransactionContext: () => wrapped,
            } as EntityManager;
            return saveReportingGroupProjection(manager, {
              source: expected,
              projections: expected.map((row) => ({
                id: row.id,
                sources: verifiedEmptySources(),
              })),
              refreshed_at: now,
            });
          });
          await compared;
          const invalidation = service.invalidateVendorFinanceReporting([
            "order_own",
          ]);
          proceed();
          expect(await saving).toBe(true);
          await invalidation;
          expect((await read()).rows[0].is_fresh).toBe(false);
        },
      );
    },
  });
}
