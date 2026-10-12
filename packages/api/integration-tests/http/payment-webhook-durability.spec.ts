/**
 * Prepared opt-in HTTP/Redis/PG regression; Stripe transport is SIMULATED.
 * After reserving Redis DB15 exclusively and importing the local TLS closure
 * environment, set PAYMENT_WEBHOOK_DURABILITY_TESTS=disposable-local and run:
 * pnpm test:integration:http --runTestsByPath integration-tests/http/payment-webhook-durability.spec.ts
 *
 * The fixture uses native authorization/fulfillment, then the actual finance
 * capture workflow writes its journal and provider metadata. Signed HTTP events
 * reach the native payment route, queue and subscriber. Marked success events
 * are intentionally NOT_SUPPORTED; a stale authorization reaches the native
 * process-payment workflow against the already captured payment. No real Stripe
 * delivery or process-crash durability is claimed by this suite.
 */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { processPaymentWorkflowId } from "@mercurjs/core/workflows";
import type { IPaymentModuleService } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentActions,
} from "@medusajs/framework/utils";
import type Stripe from "stripe";
import { createStripeClient } from "../../src/lib/stripe-client";
import { readOrderFinance } from "../../src/lib/order-finance/read";
import { financeAmount } from "../../src/lib/order-finance/policy";
import { FINAL_CAPTURE_OPERATION_METADATA } from "../../src/modules/stripe-allocated-payment/service";
import { operateOrderFinanceWorkflow } from "../../src/workflows/operate-order-finance";
import { useNativeEsmPayoutProvider } from "../helpers/native-esm-provider-loader";
import { configureNativeFinanceDatabaseTls } from "../helpers/native-finance-database-tls";
import { assertNativeFinanceRedis } from "../helpers/native-finance-redis-guard";
import { createFinanceDurabilityFixture } from "./fixtures/finance-durability-fixture";
import { installFinanceDurabilityStripe } from "./fixtures/finance-durability-stripe";

const enabled =
  process.env.PAYMENT_WEBHOOK_DURABILITY_TESTS === "disposable-local";
const apiKey = "sk_test_payment";
const signingSecret = "whsec_PaymentWebhookDurability";

if (!enabled) {
  describe.skip("Payment webhook durability (requires exclusive disposable-local infrastructure)", () => {
    it("requires the local TLS closure importer and reserved Redis DB15; see header", () => {});
  });
} else {
  // Guard before runner registration: failure cleanup itself has DB effects.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  )
    throw new Error(
      "Import the isolated closure environment without database overrides.",
    );
  assertNativeFinanceRedis(process.env);
  const redis = new URL(process.env.REDIS_URL!);
  if (!redis.username || !redis.password)
    throw new Error("Closure Redis credentials are required.");
  const dbName = `closure_payment_webhook_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://closure_test:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  process.env.STRIPE_API_KEY = apiKey;
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret;
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = "whsec_OfflinePayoutWebhook";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.FINANCE_CHECKOUT_DATA_KIND = "qa_fixture";
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.MEDUSA_DISABLE_TELEMETRY = "true";
  process.env.MEDUSA_WORKER_MODE = "shared";
  let simulated = installFinanceDurabilityStripe();
  const stripe = createStripeClient(apiKey, { maxNetworkRetries: 0 });
  jest.setTimeout(120_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        const target = new URL(config.projectConfig.databaseUrl!);
        if (
          target.hostname !== "localhost" ||
          target.port !== "55432" ||
          target.pathname !== `/${dbName}`
        ) {
          throw new Error(
            "Application and runner must use the same disposable database.",
          );
        }
        assertNativeFinanceRedis(process.env, config);
        for (const module of Object.values(config.modules ?? {})) {
          if (!module || typeof module !== "object") continue;
          const providers =
            "options" in module ? module.options?.providers : undefined;
          for (const adapter of [
            module,
            ...(Array.isArray(providers) ? providers : []),
          ]) {
            if (typeof adapter.resolve !== "string") continue;
            if (/resend|algolia|file-s3|google/i.test(adapter.resolve)) {
              throw new Error(
                "External notification/search/storage/auth providers must be disabled.",
              );
            }
            if (
              /stripe/i.test(adapter.resolve) &&
              adapter.options?.apiKey !== apiKey
            ) {
              throw new Error(
                "Only the explicit transport-simulated Stripe configuration is allowed.",
              );
            }
          }
        }
        await useNativeEsmPayoutProvider(config);
        configureNativeFinanceDatabaseTls(config, dbName);
      },
    },
    testSuite: ({ api, dbConnection, getContainer }) => {
      type Fixture = Awaited<ReturnType<typeof createFinanceDurabilityFixture>>;
      const read = (fixture: Fixture) =>
        readOrderFinance(getContainer(), fixture.orderId, {
          actor_id: fixture.actorId,
        });

      beforeEach(async () => {
        simulated.restore();
        simulated = installFinanceDurabilityStripe();
        const result = await dbConnection.raw(
          "select current_database() as database_name, ssl from pg_stat_ssl where pid = pg_backend_pid()",
        );
        expect(result.rows).toEqual([{ database_name: dbName, ssl: true }]);
      });
      afterEach(() => expect(simulated.rejected).toEqual([]));

      async function snapshot(fixture: Fixture) {
        const current = await read(fixture);
        const operations = await dbConnection.raw(
          "select id, state, token, result, updated_at from commerce_operation where group_id = ? and deleted_at is null order by id",
          [fixture.groupId],
        );
        const payment =
          current.group.orders[0].cart.payment_collection.payments[0];
        return {
          originals: current.originals,
          operations: operations.rows,
          fence: {
            token: current.state?.active_token,
            review: current.state?.review_required,
          },
          payment: {
            id: payment.id,
            captures: payment.captures
              .map((row) => ({ id: row.id, amount: financeAmount(row.amount) }))
              .sort((a, b) => a.id.localeCompare(b.id)),
            refunds: payment.refunds,
          },
          orders: current.group.orders
            .map((order) => ({
              id: order.id,
              status: order.status,
              transactions: order.transactions
                .map((row) => ({
                  id: row.id,
                  reference: row.reference,
                  reference_id: row.reference_id,
                  amount: financeAmount(row.amount),
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),
              credit_lines: order.credit_lines,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        };
      }

      function notification(
        type:
          | "payment_intent.succeeded"
          | "payment_intent.amount_capturable_updated",
        intent: Stripe.PaymentIntent,
        created: number,
      ) {
        return {
          id: `evt_${randomUUID().replaceAll("-", "")}`,
          object: "event",
          type,
          livemode: false,
          created,
          data: { object: intent },
        };
      }

      it.each([false, true])(
        "keeps journal-owned capture unchanged after duplicate signed successes (with delayed authorization: %s)",
        async (reordered) => {
          const fixture = await createFinanceDurabilityFixture(getContainer(), {
            paymentState: "authorized",
          });
          const originalBefore = (await read(fixture)).originals;
          const authorized = await stripe.paymentIntents.retrieve(
            fixture.paymentIntentId,
          );
          expect(authorized.status).toBe("requires_capture");
          expect(authorized.metadata.session_id).toEqual(expect.any(String));
          expect(
            authorized.metadata[FINAL_CAPTURE_OPERATION_METADATA],
          ).toBeUndefined();
          const requestId = randomUUID();
          const operationId = `capture:${fixture.orderId}:${requestId}`;
          await operateOrderFinanceWorkflow(getContainer()).run({
            input: {
              action: "capture",
              request_id: requestId,
              note: "Payment webhook durability with simulated Stripe",
              confirm: true,
              order_id: fixture.orderId,
              actor_id: fixture.actorId,
            },
          });
          const captured = await stripe.paymentIntents.retrieve(
            fixture.paymentIntentId,
          );
          expect(captured).toMatchObject({
            status: "succeeded",
            amount_received: 10_000,
            amount_capturable: 0,
            metadata: { [FINAL_CAPTURE_OPERATION_METADATA]: operationId },
          });
          const before = await snapshot(fixture);
          expect(before.originals).toEqual(originalBefore);
          expect(before.operations).toHaveLength(1);
          expect(before.operations[0]).toMatchObject({
            id: operationId,
            state: "complete",
            result: { capture_attempted: true },
          });
          expect(before.payment.captures).toHaveLength(1);
          expect(before.payment.captures[0].amount).toBe(100);
          expect(before.payment.refunds).toEqual([]);
          expect(
            before.orders.every((order) => order.transactions.length === 1),
          ).toBe(true);
          expect(before.fence).toEqual({ token: null, review: false });
          const providerPosts = simulated.requests.filter(
            (row) => row.method === "POST",
          ).length;
          expect(simulated.state.captureCalls).toBe(1);
          const payment = getContainer().resolve<IPaymentModuleService>(
            Modules.PAYMENT,
          );
          const engine = getContainer().resolve(Modules.WORKFLOW_ENGINE);
          // Passthrough spies only observe native parsing and workflow completion.
          const handlers = jest.spyOn(payment, "getWebhookActionAndData");
          const workflows = jest.spyOn(engine, "run");
          let deliveries = 0;
          let nativeRuns = 0;
          const matchingRuns = () =>
            workflows.mock.calls.flatMap((args, index) =>
              args[0] === processPaymentWorkflowId ? [index] : [],
            );
          const waitForCount = async (
            count: () => number,
            expected: number,
          ) => {
            const deadline = Date.now() + 30_000;
            while (count() < expected && Date.now() < deadline)
              await new Promise((resolve) => setTimeout(resolve, 50));
            expect(count()).toBe(expected);
          };
          const deliver = async (
            event: ReturnType<typeof notification>,
            action: PaymentActions,
          ) => {
            const raw = JSON.stringify(event);
            expect(
              (
                await api.post("/hooks/payment/stripe_stripe", raw, {
                  headers: {
                    "content-type": "application/json",
                    "stripe-signature":
                      stripe.webhooks.generateTestHeaderString({
                        payload: raw,
                        secret: signingSecret,
                      }),
                  },
                })
              ).status,
            ).toBe(200);
            deliveries++;
            await waitForCount(() => handlers.mock.calls.length, deliveries);
            const handled = handlers.mock.results[deliveries - 1];
            expect(handled.type).toBe("return");
            expect(await handled.value).toMatchObject({ action });
            if (action === PaymentActions.AUTHORIZED) {
              nativeRuns++;
              await waitForCount(() => matchingRuns().length, nativeRuns);
              const run =
                workflows.mock.results[matchingRuns()[nativeRuns - 1]];
              expect(run.type).toBe("return");
              expect(await run.value).toMatchObject({
                acknowledgement: { hasFinished: true, hasFailed: false },
              });
            } else {
              // Give the native subscriber's post-parse continuation a turn.
              await new Promise<void>((resolve) => setImmediate(resolve));
              expect(matchingRuns()).toHaveLength(nativeRuns);
            }
            expect(await snapshot(fixture)).toEqual(before);
            expect(
              simulated.requests.filter((row) => row.method === "POST"),
            ).toHaveLength(providerPosts);
            expect(simulated.state).toMatchObject({
              captureCalls: 1,
              refundCreates: 0,
              reversalCreates: 0,
            });
          };
          try {
            const now = Math.floor(Date.now() / 1000);
            const succeeded = notification(
              "payment_intent.succeeded",
              captured,
              now,
            );
            await deliver(succeeded, PaymentActions.NOT_SUPPORTED);
            if (reordered)
              await deliver(
                notification(
                  "payment_intent.amount_capturable_updated",
                  authorized,
                  now - 60,
                ),
                PaymentActions.AUTHORIZED,
              );
            await deliver(succeeded, PaymentActions.NOT_SUPPORTED);
            if (reordered) {
              // A different success event ID with an older provider creation time.
              await deliver(
                notification("payment_intent.succeeded", captured, now - 30),
                PaymentActions.NOT_SUPPORTED,
              );
            }
          } finally {
            handlers.mockRestore();
            workflows.mockRestore();
          }
        },
      );
    },
  });
  afterAll(() => simulated.restore());
}
