/**
 * Opt-in HTTP/Redis/PostgreSQL integration with SIMULATED Stripe GET responses.
 * Real local signatures, native HTTP handler, event bus, subscriber, workflow,
 * account lock, module persistence and remote link are retained.
 *
 * After reserving DB15 and importing Import-ClosureTestEnvironment.ps1, set
 * STRIPE_WEBHOOK_DURABILITY_TESTS=disposable-local and run from packages/api:
 * pnpm test:integration:http --runTestsByPath integration-tests/http/stripe-webhook-durability.spec.ts
 * The runner owns a random webhook_test_* database and template. It must not run
 * beside another suite or the browser QA server sharing Redis DB15.
 *
 * The guarded Connect route only accepts account.updated. It cannot recover a
 * refund/transfer. Provider-money durability belongs to the finance journal tests;
 * these tests make no claim about delivery from Stripe or real provider IO.
 */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type PayoutModule from "@mercurjs/core/modules/payout";
import type SellerModule from "@mercurjs/core/modules/seller";
import { MercurModules, PayoutAccountStatus } from "@mercurjs/types";
import type Stripe from "stripe";
import { createStripeClient } from "../../src/lib/stripe-client";
import { assertNativeFinanceRedis } from "../helpers/native-finance-redis-guard";
import { useNativeEsmPayoutProvider } from "../helpers/native-esm-provider-loader";
import { configureNativeFinanceDatabaseTls } from "../helpers/native-finance-database-tls";
import { installWebhookStripeTransport } from "../helpers/webhook-stripe-transport";

const enabled =
  process.env.STRIPE_WEBHOOK_DURABILITY_TESTS === "disposable-local";
const signingSecret = "whsec_OfflineWebhookDurability";
const apiKey = "sk_test_webhook";

if (!enabled) {
  describe.skip("Stripe webhook durability (requires disposable-local opt-in)", () => {
    it("requires exclusive closure PostgreSQL/Redis infrastructure; see header", () => {});
  });
} else {
  // Must run before registering runner hooks: even failed setup can drop a DB.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  ) {
    throw new Error(
      "Use the closure importer and an exclusive disposable database; no DB/schema override is allowed.",
    );
  }
  assertNativeFinanceRedis(process.env);
  const redis = new URL(process.env.REDIS_URL!);
  if (!redis.username || !redis.password)
    throw new Error("Closure Redis credentials are required.");
  const dbName = `webhook_test_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  process.env.MEDUSA_DISABLE_TELEMETRY = "true";
  // These are deliberately invalid provider credentials, used only for HMAC IO.
  process.env.STRIPE_API_KEY = apiKey;
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = signingSecret;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_OfflinePaymentDurability";
  const transport = installWebhookStripeTransport();
  const stripe = createStripeClient(apiKey);
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
            "Refusing a database other than this runner's disposable database.",
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
                "Disable external notification/search/storage/auth providers using the closure importer.",
              );
            }
            if (
              /stripe/i.test(adapter.resolve) &&
              adapter.options?.apiKey !== apiKey
            ) {
              throw new Error(
                "Only the explicitly simulated Stripe configuration is allowed.",
              );
            }
          }
        }
        await useNativeEsmPayoutProvider(config);
        configureNativeFinanceDatabaseTls(config, dbName);
      },
    },
    testSuite: ({ api, dbConnection, getContainer }) => {
      const payout = () =>
        getContainer().resolve<InstanceType<typeof PayoutModule.service>>(
          MercurModules.PAYOUT,
        );
      const sellers = () =>
        getContainer().resolve<InstanceType<typeof SellerModule.service>>(
          MercurModules.SELLER,
        );

      beforeEach(async () => {
        const result = await dbConnection.raw(
          "select current_database() as database_name, ssl from pg_stat_ssl where pid = pg_backend_pid()",
        );
        expect(result.rows).toEqual([{ database_name: dbName, ssl: true }]);
      });

      async function fixture() {
        // Fixture-only CRUD in the runner-owned database; no provider creation.
        const seller = await sellers().createSellers({
          name: "Webhook durability fixture",
          handle: `webhook-${randomUUID()}`,
          email: `webhook-${randomUUID()}@example.invalid`,
          currency_code: "usd",
        });
        const stripeId = `acct_${randomUUID().replaceAll("-", "")}`;
        const account = await payout().createPayoutAccounts({
          status: PayoutAccountStatus.PENDING,
          data: { id: stripeId },
        });
        await getContainer()
          .resolve(ContainerRegistrationKeys.LINK)
          .create([
            {
              [MercurModules.SELLER]: { seller_id: seller.id },
              [MercurModules.PAYOUT]: { payout_account_id: account.id },
            },
          ]);
        return { sellerId: seller.id, localId: account.id, stripeId };
      }
      type Fixture = Awaited<ReturnType<typeof fixture>>;

      function accountState(f: Fixture, active: boolean): Stripe.Account {
        return {
          id: f.stripeId,
          object: "account",
          type: "express",
          country: "US",
          business_type: "individual",
          email: null,
          charges_enabled: active,
          payouts_enabled: active,
          details_submitted: true,
          capabilities: { transfers: active ? "active" : "inactive" },
          metadata: { account_id: f.localId },
          requirements: {
            alternatives: [],
            current_deadline: null,
            currently_due: active ? [] : ["individual.verification.document"],
            disabled_reason: active ? null : "requirements.past_due",
            errors: [],
            eventually_due: [],
            past_due: [],
            pending_verification: [],
          },
        };
      }

      function event(f: Fixture, active: boolean, created: number) {
        return {
          id: `evt_${randomUUID().replaceAll("-", "")}`,
          object: "event",
          type: "account.updated",
          livemode: false,
          created,
          account: f.stripeId,
          data: { object: accountState(f, active) },
        };
      }

      const post = (body: ReturnType<typeof event>, signature?: string) => {
        const raw = JSON.stringify(body);
        return api.post("/hooks/payout", raw, {
          headers: {
            "content-type": "application/json",
            "stripe-signature":
              signature ??
              stripe.webhooks.generateTestHeaderString({
                payload: raw,
                secret: signingSecret,
              }),
          },
          validateStatus: () => true,
        });
      };

      async function assertSingleAccount(
        f: Fixture,
        status: PayoutAccountStatus,
      ) {
        expect(await payout().retrievePayoutAccount(f.localId)).toMatchObject({
          id: f.localId,
          status,
          data: { id: f.stripeId },
        });
        expect(await payout().listPayoutAccounts()).toHaveLength(1);
        expect(await payout().listPayouts()).toHaveLength(0);
        const { data: links } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph(
            {
              entity: "seller_payout_account",
              fields: ["seller_id", "payout_account_id"],
              filters: { seller_id: f.sellerId },
            },
            { cache: { enable: false } },
          );
        expect(links).toEqual([
          expect.objectContaining({
            seller_id: f.sellerId,
            payout_account_id: f.localId,
          }),
        ]);
      }

      it("persists current readiness through duplicate and reordered HTTP deliveries without duplicate accounts or payouts", async () => {
        const f = await fixture();
        const engine = getContainer().resolve(Modules.WORKFLOW_ENGINE);
        // A passthrough spy observes completion; the actual registered workflow runs.
        const runs = jest.spyOn(engine, "run");
        const now = Math.floor(Date.now() / 1000);
        const oldActive = event(f, true, now - 3600);
        const newRestricted = event(f, false, now);
        const readsBefore = transport.reads.length;
        let deliveries = 0;
        const deliver = async (notification: ReturnType<typeof event>) => {
          expect((await post(notification)).status).toBe(200);
          deliveries++;
          const deadline = Date.now() + 30_000;
          const matching = () =>
            runs.mock.calls.flatMap((args, index) =>
              args[0] === "reconcile-stripe-account" ? [index] : [],
            );
          while (matching().length < deliveries && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          expect(matching()).toHaveLength(deliveries);
          const result = runs.mock.results[matching()[deliveries - 1]];
          expect(result.type).toBe("return");
          expect(await result.value).toMatchObject({
            acknowledgement: { hasFinished: true, hasFailed: false },
          });
        };
        try {
          transport.accounts.set(f.stripeId, accountState(f, true));
          await deliver(oldActive);
          await assertSingleAccount(f, PayoutAccountStatus.ACTIVE);
          await deliver(oldActive); // Exact same event ID and body.
          await assertSingleAccount(f, PayoutAccountStatus.ACTIVE);

          transport.accounts.set(f.stripeId, accountState(f, false));
          await deliver(newRestricted);
          await assertSingleAccount(f, PayoutAccountStatus.RESTRICTED);
          await deliver(oldActive); // Older activation must not undo restriction.
          await assertSingleAccount(f, PayoutAccountStatus.RESTRICTED);
          await deliver(newRestricted);
          await assertSingleAccount(f, PayoutAccountStatus.RESTRICTED);

          transport.accounts.set(f.stripeId, accountState(f, true));
          await deliver(newRestricted); // Same old event must consult current truth.
          await assertSingleAccount(f, PayoutAccountStatus.ACTIVE);
          // One provider hydration and one fresh read under the account lock.
          expect(transport.reads.slice(readsBefore)).toEqual(
            Array(12).fill(f.stripeId),
          );
          expect(transport.rejected).toEqual([]);
        } finally {
          runs.mockRestore();
        }
      });

      it("rejects forged or wrongly bound HTTP deliveries before enqueue and persistence", async () => {
        const f = await fixture();
        transport.accounts.set(f.stripeId, accountState(f, true));
        const notification = event(f, true, Math.floor(Date.now() / 1000));
        const eventBus = getContainer().resolve(Modules.EVENT_BUS);
        const emit = jest.spyOn(eventBus, "emit");
        const readsBefore = transport.reads.length;
        try {
          expect((await post(notification, "t=1,v1=forged")).status).toBe(400);
          expect(
            (await post({ ...notification, account: "acct_WrongIdentity" }))
              .status,
          ).toBe(400);
          expect(
            emit.mock.calls.some(
              ([data]) =>
                !Array.isArray(data) && data.name === "payout.webhook_received",
            ),
          ).toBe(false);
          expect(transport.reads).toHaveLength(readsBefore);
          await assertSingleAccount(f, PayoutAccountStatus.PENDING);
          expect(transport.rejected).toEqual([]);
        } finally {
          emit.mockRestore();
        }
      });
    },
  });
  // Runner cleanup is registered first, so HTTPS stays blocked through shutdown.
  afterAll(() => transport.restore());
}
