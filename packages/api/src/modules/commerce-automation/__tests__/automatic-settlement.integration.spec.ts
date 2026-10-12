import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { parseISO } from "date-fns/parseISO";
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
import { Migration20261003061545 } from "../migrations/Migration20261003061545";
import { Migration20261006171340 } from "../migrations/Migration20261006171340";
import { originalSales } from "../../../lib/order-finance/__tests__/fixtures";
import type { OriginalSale } from "../../../lib/order-finance/snapshot";

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
    "Automatic settlement persistence tests require reserved disposable localhost PostgreSQL with TLS.",
  );
}

function originalOrder(orderId: string): OriginalSale {
  return {
    ...originalSales()[0],
    order_id: orderId,
    group_id: `group_${randomUUID()}`,
    cart_id: `cart_${randomUUID()}`,
    seller_id: `seller_${randomUUID()}`,
  };
}

const OBSERVED_ORDER_UPDATED_AT = "2026-10-01T12:00:00.000Z";

function confirmedOrders(orderIds: string[]) {
  return orderIds.map((id) => ({
    id,
    observed_order_updated_at: OBSERVED_ORDER_UPDATED_AT,
  }));
}

if (!enabled) {
  describe.skip("automatic settlement clock (real PostgreSQL)", () => {
    it("requires AUTOMATIC_SETTLEMENT_TESTS=disposable-local and an infrastructure reservation", () => {});
  });
} else {
  describe("automatic settlement clock (real PostgreSQL)", () => {
    // The native runner owns a new database and actual module repositories. This
    // suite exercises SQL persistence; provider execution is tested separately.
    const dbName = `closure_auto_clock_${randomUUID().replaceAll("-", "")}`;
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
            connectionTimeoutMillis: 10_000,
          });
          try {
            await connection.connect();
            // Replace only this suite's empty model-generated clock table with
            // the actual migration SQL, including its CHECK and trigger.
            const down = new Migration20261003061545(
              undefined as never,
              undefined as never,
            );
            await down.down();
            const up = new Migration20261003061545(
              undefined as never,
              undefined as never,
            );
            await up.up();
            const configurableDelay = new Migration20261006171340(
              undefined as never,
              undefined as never,
            );
            await configurableDelay.up();
            await connection.query("begin");
            for (const sql of [
              ...down.getQueries(),
              ...up.getQueries(),
              ...configurableDelay.getQueries(),
            ]) {
              await connection.query(String(sql));
            }
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
        function recordCompletions(orderIds: string[], days = 3) {
          return service.recordOrderCompletions(
            confirmedOrders(orderIds).map((order) => ({
              ...order,
              release_delay_days: days,
            })),
          );
        }

        beforeEach(async () => {
          const tls: { ssl: boolean }[] =
            await MikroOrmWrapper.getManager().execute(
              "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
            );
          expect(tls[0].ssl).toBe(true);
        });

        function restartService(): CommerceAutomationService {
          // Rebuild the actual service with its native repositories: cursor and
          // completion state must survive losing all service-instance state.
          const container = Reflect.get(
            service,
            "__container__",
          ) as ConstructorParameters<typeof CommerceAutomationService>[0];
          return new CommerceAutomationService(container);
        }

        it("persists the first server observation and exact 72-hour deadline without restarting them on replay", async () => {
          const original = originalOrder("order_clock");
          await service.recordOriginalSales([original]);
          const started = Date.now();
          const receipts = await recordCompletions([
            original.order_id,
            original.order_id,
          ]);
          const ended = Date.now();
          expect(receipts).toHaveLength(1);
          const receipt = receipts[0];
          const completedAt = parseISO(receipt.completed_at);
          const eligibleAt = parseISO(receipt.eligible_at);
          expect(completedAt.getTime()).toBeGreaterThanOrEqual(started);
          expect(completedAt.getTime()).toBeLessThanOrEqual(ended);
          expect(eligibleAt.getTime() - completedAt.getTime()).toBe(
            72 * 60 * 60 * 1_000,
          );
          expect(receipt).toMatchObject({
            id: original.order_id,
            group_id: original.group_id,
            cart_id: original.cart_id,
            seller_id: original.seller_id,
            observed_order_updated_at: OBSERVED_ORDER_UPDATED_AT,
          });
          expect(
            await restartService().recordOrderCompletions(
              confirmedOrders([original.order_id]),
            ),
          ).toEqual([]);
          expect(
            await service.readOrderCompletion(original.order_id),
          ).toMatchObject({
            completed_at: completedAt,
            eligible_at: eligibleAt,
            registration_token: receipt.registration_token,
            observed_order_updated_at: parseISO(OBSERVED_ORDER_UPDATED_AT),
          });
        });

        it("admits one concurrent insertion with one immutable receipt and one stored row", async () => {
          const original = originalOrder("order_race");
          await service.recordOriginalSales([original]);
          const results = await Promise.all(
            Array.from({ length: 8 }, () =>
              recordCompletions([original.order_id]),
            ),
          );
          expect(results.flat()).toHaveLength(1);
          const [completions, count] =
            await service.listAndCountOrderCompletions({
              id: original.order_id,
            });
          expect(count).toBe(1);
          expect(completions[0].registration_token).toBe(
            results.flat()[0].registration_token,
          );
        });

        it.each([0, 1, 2, 3, 365])(
          "persists a %i-day clock, enforces its boundary and keeps it on replay with another setting",
          async (days) => {
            const original = originalOrder(`order_delay_${days}`);
            await service.recordOriginalSales([original]);
            const [receipt] = await recordCompletions(
              [original.order_id],
              days,
            );
            const completedAt = parseISO(receipt.completed_at);
            const eligibleAt = parseISO(receipt.eligible_at);
            expect(receipt.release_delay_days).toBe(days);
            expect(eligibleAt.getTime() - completedAt.getTime()).toBe(
              days * 86_400_000,
            );
            expect(
              await service.listDueOrderCompletions({
                position: null,
                now: new Date(eligibleAt.getTime() - 1),
                take: 100,
              }),
            ).toEqual([]);
            expect(
              (
                await service.listDueOrderCompletions({
                  position: null,
                  now: eligibleAt,
                  take: 100,
                })
              ).map((entry) => entry.id),
            ).toEqual([original.order_id]);
            const restarted = restartService();
            expect(
              await restarted.recordOrderCompletions(
                confirmedOrders([original.order_id]).map((order) => ({
                  ...order,
                  release_delay_days: days === 0 ? 3 : 0,
                })),
              ),
            ).toEqual([]);
            expect(
              await restarted.readOrderCompletion(original.order_id),
            ).toMatchObject({
              completed_at: completedAt,
              eligible_at: eligibleAt,
              registration_token: receipt.registration_token,
              release_delay_days: days,
            });
          },
        );

        it("rejects invalid delays and a snapshot that disagrees with the SQL deadline", async () => {
          const original = originalOrder("order_bad_delay");
          await service.recordOriginalSales([original]);
          for (const days of [-1, 0.5, 366, NaN, Infinity]) {
            await expect(
              recordCompletions([original.order_id], days),
            ).rejects.toThrow();
          }
          expect(
            await service.readOrderCompletion(original.order_id),
          ).toBeNull();
          await recordCompletions([original.order_id]);
          const manager = MikroOrmWrapper.getManager();
          for (const days of [-1, 0, 366]) {
            await expect(
              manager.execute(
                `insert into order_completion
                (id, group_id, cart_id, seller_id, completed_at, eligible_at, registration_token, observed_order_updated_at, release_delay_days)
              select id || '_invalid_' || cast(? as text), group_id, cart_id, seller_id,
                completed_at, eligible_at, registration_token, observed_order_updated_at, ?
              from order_completion where id = ?`,
                [days, days, original.order_id],
              ),
            ).rejects.toThrow("order_completion_retention");
          }
          await expect(
            manager.execute(
              "update order_completion set release_delay_days = 0 where id = ?",
              [original.order_id],
            ),
          ).rejects.toThrow(
            "Order completion clocks and bindings are immutable",
          );
        });

        it("rolls back an earlier clock in the same batch when a later SQL insertion fails", async () => {
          await service.recordOriginalSales([
            originalOrder("order_a"),
            originalOrder("order_b"),
          ]);
          const manager = MikroOrmWrapper.getManager();
          await manager.execute(
            "alter table order_completion add constraint reject_test_clock check (id <> 'order_b')",
          );
          try {
            await expect(
              recordCompletions(["order_a", "order_b"]),
            ).rejects.toThrow();
            expect(await service.listOrderCompletions()).toEqual([]);
          } finally {
            await manager.execute(
              "alter table order_completion drop constraint reject_test_clock",
            );
          }
        });

        it("keeps the first committed clock when the response is lost and delivery is retried", async () => {
          const original = originalOrder("order_lost_response");
          await service.recordOriginalSales([original]);
          await expect(
            (async () => {
              await recordCompletions([original.order_id]);
              throw new Error("Simulated response lost after SQL commit");
            })(),
          ).rejects.toThrow("Simulated response lost after SQL commit");
          const committed = await service.readOrderCompletion(
            original.order_id,
          );
          expect(committed).not.toBeNull();
          const restarted = restartService();
          expect(
            await restarted.recordOrderCompletions(
              confirmedOrders([original.order_id]),
            ),
          ).toEqual([]);
          expect(
            await restarted.readOrderCompletion(original.order_id),
          ).toMatchObject({
            registration_token: committed!.registration_token,
            completed_at: committed!.completed_at,
            eligible_at: committed!.eligible_at,
          });
        });

        it("rejects a changed native completion proof without resetting the original deadline", async () => {
          const original = originalOrder("order_changed_proof");
          await service.recordOriginalSales([original]);
          const [receipt] = await recordCompletions([original.order_id]);
          await expect(
            service.recordOrderCompletions([
              {
                id: original.order_id,
                observed_order_updated_at: "2026-10-01T12:00:01.000Z",
              },
            ]),
          ).rejects.toMatchObject({ type: "conflict" });
          expect(
            await service.readOrderCompletion(original.order_id),
          ).toMatchObject({
            observed_order_updated_at: parseISO(OBSERVED_ORDER_UPDATED_AT),
            completed_at: parseISO(receipt.completed_at),
            eligible_at: parseISO(receipt.eligible_at),
            registration_token: receipt.registration_token,
          });
        });

        it("excludes a clock one millisecond before 72 hours and includes it exactly at the deadline", async () => {
          await service.recordOriginalSales([
            originalOrder("order_b"),
            originalOrder("order_a"),
          ]);
          const [receipt] = await recordCompletions(["order_b", "order_a"]);
          const due = parseISO(receipt.eligible_at);
          expect(
            await service.listDueOrderCompletions({
              position: null,
              now: new Date(due.getTime() - 1),
              take: 100,
            }),
          ).toEqual([]);
          expect(
            (
              await service.listDueOrderCompletions({
                position: null,
                now: due,
                take: 100,
              })
            ).map((completion) => completion.id),
          ).toEqual(["order_a", "order_b"]);
        });

        it("continues to later IDs after service reconstruction and wraps without changing the commerce cursor", async () => {
          await service.recordOriginalSales([
            originalOrder("order_a"),
            originalOrder("order_b"),
          ]);
          const receipts = await recordCompletions(["order_a", "order_b"]);
          const now = parseISO(receipts[0].eligible_at);
          await service.createCommerceScans({
            id: "groups",
            position: "group_unrelated",
          });
          const first = await service.listDueOrderCompletions({
            position: await service.readAutomaticSettlementScan(),
            now,
            take: 1,
          });
          expect(first.map((completion) => completion.id)).toEqual(["order_a"]);
          await service.advanceAutomaticSettlementScan(null, first[0].id);
          const restarted = restartService();
          expect(await restarted.readAutomaticSettlementScan()).toBe("order_a");
          const next = await restarted.listDueOrderCompletions({
            position: await restarted.readAutomaticSettlementScan(),
            now,
            take: 1,
          });
          expect(next.map((completion) => completion.id)).toEqual(["order_b"]);
          await restarted.advanceAutomaticSettlementScan("order_a", next[0].id);
          expect(
            await restarted.listDueOrderCompletions({
              position: "order_b",
              now,
              take: 1,
            }),
          ).toEqual([]);
          await restarted.advanceAutomaticSettlementScan("order_b", null);
          expect(
            await restartService().readAutomaticSettlementScan(),
          ).toBeNull();
          expect((await service.retrieveCommerceScan("groups")).position).toBe(
            "group_unrelated",
          );
        });

        it("allows one concurrent cursor writer and prevents stale scanners from replacing its position", async () => {
          await Promise.all([
            service.advanceAutomaticSettlementScan(null, "order_a"),
            service.advanceAutomaticSettlementScan(null, "order_b"),
          ]);
          const position = await service.readAutomaticSettlementScan();
          expect(["order_a", "order_b"]).toContain(position);
          await restartService().advanceAutomaticSettlementScan(
            null,
            "order_stale",
          );
          expect(await service.readAutomaticSettlementScan()).toBe(position);
          await service.advanceAutomaticSettlementScan(position, null);
          expect(await service.readAutomaticSettlementScan()).toBeNull();
        });

        it("omits every claimed payout before pagination so paid or uncertain history cannot delay a new order", async () => {
          const orders = [
            originalOrder("order_a_paid"),
            originalOrder("order_b_new"),
            originalOrder("order_c_processing"),
            originalOrder("order_d_uncertain"),
          ];
          await service.recordOriginalSales(orders);
          const receipts = await recordCompletions(
            orders.map((original) => original.order_id),
          );
          await service.createCommerceOperations([
            {
              id: "payout:order_a_paid",
              group_id: orders[0].group_id,
              token: randomUUID(),
              kind: "payout",
              target_id: orders[0].order_id,
              state: "complete",
            },
            {
              id: "payout:order_c_processing",
              group_id: orders[2].group_id,
              token: randomUUID(),
              kind: "payout",
              target_id: orders[2].order_id,
              state: "processing",
            },
            {
              id: "payout:order_d_uncertain",
              group_id: orders[3].group_id,
              token: randomUUID(),
              kind: "payout",
              target_id: orders[3].order_id,
              state: "uncertain",
            },
          ]);
          const now = parseISO(receipts[0].eligible_at);
          expect(
            (
              await service.listDueOrderCompletions({
                position: null,
                now,
                take: 1,
              })
            ).map((completion) => completion.id),
          ).toEqual(["order_b_new"]);
          expect(
            (
              await service.listDueOrderCompletions({
                position: "order_b_new",
                now,
                take: 1,
              })
            ).map((completion) => completion.id),
          ).toEqual([]);
          expect(
            (
              await service.listDueOrderCompletions({
                position: null,
                now,
                take: 100,
              })
            ).map((completion) => completion.id),
          ).toEqual(["order_b_new"]);
        });

        it("does not fabricate a clock for a missing original and rejects a replacement with a different seller binding", async () => {
          expect(await recordCompletions(["order_legacy"])).toEqual([]);
          expect(await service.readOrderCompletion("order_legacy")).toBeNull();
          const original = originalOrder("order_binding");
          await service.recordOriginalSales([original]);
          const [receipt] = await recordCompletions([original.order_id]);
          await service.discardOriginalSales([original.order_id]);
          expect(await recordCompletions([original.order_id])).toEqual([]);
          await service.recordOriginalSales([
            { ...original, seller_id: "seller_replaced" },
          ]);
          await expect(
            recordCompletions([original.order_id]),
          ).rejects.toMatchObject({ type: "conflict" });
          expect(
            await service.readOrderCompletion(original.order_id),
          ).toMatchObject({
            seller_id: original.seller_id,
            registration_token: receipt.registration_token,
          });
        });

        it("keeps all five financial tables private with RLS and no public table or routine privileges", async () => {
          const manager = MikroOrmWrapper.getManager();
          const security: {
            table_name: string;
            rls_enabled: boolean;
            policies: number;
            public_table_privileges: number;
            public_routine_privileges: number;
          }[] = await manager.execute(`select
            c.relname as table_name,
            c.relrowsecurity as rls_enabled,
            (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies,
            (select count(*)::int from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
              where a.grantee=0) as public_table_privileges,
            (select count(*)::int from pg_proc f,
              lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
              where f.oid='public.reject_order_completion_update()'::regprocedure and a.grantee=0)
              as public_routine_privileges
            from pg_class c where c.relnamespace='public'::regnamespace
              and c.relname in ('finance_sale_snapshot','finance_provider_cost',
                'finance_provider_fact','finance_recovery_attempt','order_completion')
            order by c.relname`);
          const privateTables = [
            "finance_provider_cost",
            "finance_provider_fact",
            "finance_recovery_attempt",
            "finance_sale_snapshot",
            "order_completion",
          ];
          expect(security).toEqual(
            privateTables.map((tableName) => ({
              table_name: tableName,
              rls_enabled: true,
              policies: 0,
              public_table_privileges: 0,
              public_routine_privileges: 0,
            })),
          );
          const apiRoles: {
            table_privileges: boolean;
            routine_execution: boolean;
          }[] = await manager.execute(`select
            has_table_privilege(r.oid,c.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as table_privileges,
            has_function_privilege(r.oid,'public.reject_order_completion_update()','EXECUTE')
              as routine_execution
            from pg_roles r cross join pg_class c
            where r.rolname in ('anon','authenticated') and c.relnamespace='public'::regnamespace
              and c.relname in ('finance_sale_snapshot','finance_provider_cost',
                'finance_provider_fact','finance_recovery_attempt','order_completion')`);
          for (const role of apiRoles) {
            expect(role).toEqual({
              table_privileges: false,
              routine_execution: false,
            });
          }
          const original = originalOrder("order_private");
          await service.recordOriginalSales([original]);
          await recordCompletions([original.order_id]);
          expect(
            await service.readOrderCompletion(original.order_id),
          ).toMatchObject({ id: original.order_id });
        });

        it("rejects SQL and generated CRUD updates to an existing clock", async () => {
          const original = originalOrder("order_immutable");
          await service.recordOriginalSales([original]);
          const [receipt] = await recordCompletions([original.order_id]);
          await expect(
            MikroOrmWrapper.getManager().execute(
              "update order_completion set eligible_at = eligible_at + interval '1 hour' where id = ?",
              [original.order_id],
            ),
          ).rejects.toThrow(
            "Order completion clocks and bindings are immutable",
          );
          await expect(
            service.updateOrderCompletions({
              id: original.order_id,
              seller_id: "seller_changed",
            }),
          ).rejects.toThrow(
            "Order completion clocks and bindings are immutable",
          );
          await expect(
            MikroOrmWrapper.getManager().execute(
              "update order_completion set observed_order_updated_at = observed_order_updated_at + interval '1 second' where id = ?",
              [original.order_id],
            ),
          ).rejects.toThrow(
            "Order completion clocks and bindings are immutable",
          );
          expect(
            await service.readOrderCompletion(original.order_id),
          ).toMatchObject({
            registration_token: receipt.registration_token,
            seller_id: receipt.seller_id,
            eligible_at: parseISO(receipt.eligible_at),
            observed_order_updated_at: parseISO(OBSERVED_ORDER_UPDATED_AT),
          });
        });

        it("rejects a shorter retention period and nonfinite timestamps at the database boundary", async () => {
          const original = originalOrder("order_invalid_retention");
          await service.recordOriginalSales([original]);
          await recordCompletions([original.order_id]);
          const manager = MikroOrmWrapper.getManager();
          await expect(
            manager.execute(
              `insert into order_completion
                (id, group_id, cart_id, seller_id, completed_at, eligible_at, registration_token, observed_order_updated_at)
              select id || '_short', group_id, cart_id, seller_id,
                completed_at, eligible_at - interval '1 millisecond', registration_token, observed_order_updated_at
              from order_completion where id = ?`,
              [original.order_id],
            ),
          ).rejects.toThrow("order_completion_retention");
          await expect(
            manager.execute(
              `insert into order_completion
                (id, group_id, cart_id, seller_id, completed_at, eligible_at, registration_token, observed_order_updated_at)
              select id || '_infinite', group_id, cart_id, seller_id,
                'infinity'::timestamptz, 'infinity'::timestamptz, registration_token, observed_order_updated_at
              from order_completion where id = ?`,
              [original.order_id],
            ),
          ).rejects.toThrow("order_completion_retention");
          expect(await service.listOrderCompletions()).toHaveLength(1);
        });
      },
    });
  });
}
