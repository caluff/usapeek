import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@medusajs/framework/pg";
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
import { AdminFinanceReportingProjection } from "../models/admin-finance-reporting-projection";
import { Migration20261004012955 } from "../migrations/Migration20261004012955";
import { Migration20261005141208 } from "../migrations/Migration20261005141208";

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
    "Admin reporting tests require reserved disposable localhost PostgreSQL with TLS.",
  );

function unavailableSources() {
  return {
    facts: [],
    costs: [],
    capture_allocations: [],
    refund_adjustments: [],
    coverage: {
      complete: false,
      issues: [],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days" as const,
    },
  };
}

if (!enabled) {
  describe.skip("admin reporting projections (real PostgreSQL)", () => {
    it("requires reserved disposable infrastructure", () => {});
  });
} else {
  const dbName = `closure_admin_reporting_${randomUUID().replaceAll("-", "")}`;
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
      AdminFinanceReportingProjection,
    ],
    hooks: {
      beforeModuleInit: async () => {
        const client = new Client({
          host: "localhost",
          port: 55432,
          user: "closure_test",
          password: process.env.DB_PASSWORD,
          database: dbName,
          ssl: { rejectUnauthorized: true },
        });
        try {
          await client.connect();
          await client.query("begin");
          await client.query(`do $test_roles$ begin
            if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
            if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
          end $test_roles$`);
          for (const Migration of [
            Migration20261004012955,
            Migration20261005141208,
          ]) {
            const migration = new Migration(
              undefined as never,
              undefined as never,
            );
            await migration.up();
            for (const sql of migration.getQueries())
              await client.query(String(sql));
          }
          await client.query("commit");
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          await client.end();
        }
      },
    },
    testSuite: ({ service, MikroOrmWrapper }) => {
      const now = new Date();
      const manager = () => MikroOrmWrapper.getManager();
      async function seed(
        group = "group_own",
        order = "order_own",
        seller = "seller_own",
      ) {
        await manager().execute(
          "insert into commerce_group_state (id, cart_id, observation) values (?, ?, '{}'::jsonb)",
          [group, `cart_${group}`],
        );
        await service.registerVendorReportingReferences([
          {
            id: order,
            seller_id: seller,
            group_id: group,
            cart_id: `cart_${group}`,
            native_revision: "native_v1",
            order_display_id: 16,
            order_custom_display_id: null,
          },
        ]);
        return sources(group);
      }
      async function sources(group = "group_own") {
        const source = await service.readVendorReportingGroupSource(group);
        const adminSource = await service.readAdminReportingGroupSource(group);
        if (!adminSource) throw new Error("Missing seeded group");
        return {
          source,
          projections: source.map((row) => ({
            id: row.id,
            sources: unavailableSources(),
          })),
          refreshed_at: now,
          admin: { source: adminSource, sources: unavailableSources() },
        };
      }
      const registry = () => service.readAdminFinanceReportingRegistry();

      it("commits both projections and rejects semantic cost changes, including absent and deleted costs", async () => {
        await seed();
        await manager()
          .execute(`insert into finance_provider_fact (id, group_id, mode, account_id, kind, fact)
          values ('fact_test', 'group_own', 'test', 'acct_test', 'capture', '{"mode":"test","account_id":"acct_test","balance_transaction_id":"txn_test"}'::jsonb)`);
        const missingCost = await sources();
        expect(await service.saveVendorReportingProjection(missingCost)).toBe(
          true,
        );
        expect((await registry()).rows[0].is_fresh).toBe(true);
        await manager()
          .execute(`insert into finance_provider_cost (id, mode, account_id, balance_transaction_id, cost)
          values ('stripe:test:acct_test:balance_transaction:txn_test','test','acct_test','txn_test','{"fee":1}'::jsonb)`);
        expect((await registry()).rows[0].is_fresh).toBe(false);
        expect(await service.saveVendorReportingProjection(missingCost)).toBe(
          false,
        );
        const presentCost = await sources();
        expect(await service.saveVendorReportingProjection(presentCost)).toBe(
          true,
        );
        await manager().execute(
          `update finance_provider_cost set cost = '{"fee":2}'::jsonb where balance_transaction_id = 'txn_test'`,
        );
        expect(await service.saveVendorReportingProjection(presentCost)).toBe(
          false,
        );
        expect((await registry()).rows[0].is_fresh).toBe(false);
        expect(
          await service.saveVendorReportingProjection(await sources()),
        ).toBe(true);
        await manager().execute(
          "update finance_provider_cost set deleted_at = now() where balance_transaction_id = 'txn_test'",
        );
        expect((await registry()).rows[0].is_fresh).toBe(false);
      });

      it("rolls back the Admin write when the seller comparison rejects its stale revision", async () => {
        const input = await seed();
        input.source[0].source_revision = "stale_vendor_revision";
        await expect(
          service.saveVendorReportingProjection(input),
        ).rejects.toThrow("both projections were rolled back");
        expect((await registry()).rows[0].sources).toBeNull();
        const vendor = await service.readVendorFinanceReportingRegistry({
          seller_id: "seller_own",
          now,
        });
        expect(vendor.rows[0].sources).toBeNull();
      });

      it("rolls back both sides after a later PostgreSQL constraint failure", async () => {
        const input = await seed();
        await manager().execute(
          "alter table vendor_finance_reporting_projection add constraint admin_rollback_probe check (sources is null)",
        );
        try {
          await expect(
            service.saveVendorReportingProjection(input),
          ).rejects.toThrow();
          expect((await registry()).rows[0].sources).toBeNull();
          expect(
            (
              await service.readVendorFinanceReportingRegistry({
                seller_id: "seller_own",
                now,
              })
            ).rows[0].sources,
          ).toBeNull();
        } finally {
          await manager().execute(
            "alter table vendor_finance_reporting_projection drop constraint admin_rollback_probe",
          );
        }
      });

      it("waits for a concurrent journal writer and rejects evidence captured before its committed change", async () => {
        const input = await seed();
        const transaction = await manager().getKnex().transaction();
        await transaction("commerce_group_state")
          .where({ id: "group_own" })
          .forUpdate()
          .first();
        let completed = false;
        const saving = service
          .saveVendorReportingProjection(input)
          .then((saved) => {
            completed = true;
            return saved;
          });
        try {
          await new Promise((done) => setTimeout(done, 50));
          expect(completed).toBe(false);
          await transaction("commerce_group_state")
            .where({ id: "group_own" })
            .update({
              observation: JSON.stringify({ concurrent_writer: true }),
            });
          await transaction.commit();
          expect(await saving).toBe(false);
          expect((await registry()).rows[0].sources).toBeNull();
        } finally {
          if (!transaction.isCompleted()) await transaction.rollback();
          await saving;
        }
      });

      it("invalidates additions and tokens, and keeps unsafe evaluated groups from starving the next group", async () => {
        expect(await service.saveVendorReportingProjection(await seed())).toBe(
          true,
        );
        await service.registerVendorReportingReferences([
          {
            id: "order_other",
            seller_id: "seller_other",
            group_id: "group_own",
            cart_id: "cart_group_own",
            native_revision: "native_v1",
            order_display_id: 17,
            order_custom_display_id: null,
          },
        ]);
        expect((await registry()).rows[0].is_fresh).toBe(false);
        await manager().execute(
          "update commerce_group_state set review_required = true where id = 'group_own'",
        );
        expect(
          await service.saveVendorReportingProjection(await sources()),
        ).toBe(true);
        expect((await registry()).rows[0]).toMatchObject({
          unsafe: true,
          is_fresh: true,
        });
        await seed("group_next", "order_next");
        expect(await service.listDirtyAdminReportingGroups()).toEqual([
          "group_next",
        ]);
        await service.invalidateVendorFinanceReporting(["order_other"]);
        expect(
          (await registry()).rows.find((row) => row.id === "group_own")
            ?.is_fresh,
        ).toBe(false);
      });

      it("enables RLS and revokes public direct reads of the private projection", async () => {
        const rows = await manager()
          .execute(`select c.relrowsecurity, exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          where a.grantee = 0 and a.privilege_type = 'SELECT') as public_read
          from pg_class c where c.oid = 'admin_finance_reporting_projection'::regclass`);
        expect(rows[0]).toMatchObject({
          relrowsecurity: true,
          public_read: false,
        });
        const privileges = await manager().execute(`select
            has_table_privilege('anon', 'admin_finance_reporting_projection', 'SELECT') as anonymous_read,
            has_table_privilege('authenticated', 'admin_finance_reporting_projection', 'SELECT') as authenticated_read`);
        expect(privileges[0]).toEqual({
          anonymous_read: false,
          authenticated_read: false,
        });
      });
    },
  });
}
