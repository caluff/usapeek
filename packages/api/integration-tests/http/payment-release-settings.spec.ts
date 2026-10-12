/**
 * PAYMENT_RELEASE_SETTINGS_TESTS=disposable-local opts into a UUID-owned native
 * runner using reserved TLS PostgreSQL:55432 and Redis:56379/15. Providers stay
 * disabled at bootstrap. Readiness fixtures are local strings enabled only
 * after startup; this suite creates no orders, payments or Stripe accounts and
 * never executes a financial operation or calls an external provider.
 */
import { randomUUID } from "node:crypto";
import type {
  IAuthModuleService,
  ILockingModule,
  IStoreModuleService,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  PolicyOperation,
} from "@medusajs/framework/utils";
import {
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createUsersWorkflow,
  updateStoresWorkflow,
} from "@medusajs/core-flows";
import { createSellerAccountWorkflow } from "@mercurjs/core/workflows";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import Redis from "ioredis";
import { REDIS_CONNECTION_OPTIONS } from "../../src/lib/redis-options";
import type { PaymentReleaseSettingsResponse } from "../../src/lib/order-finance/contracts";
import { automaticSettlementEnabled } from "../../src/lib/order-finance/automatic-settlement";
import {
  CAPTURE_SETTINGS_LOCK_KEY,
  CAPTURE_SETTINGS_METADATA_KEY,
} from "../../src/lib/order-finance/capture-settings";
import { withPaymentSettingsLock } from "../../src/lib/order-finance/payment-settings-lock";
import { RELEASE_SETTINGS_METADATA_KEY } from "../../src/lib/order-finance/release-settings";
import {
  assertLifecycleBootstrap,
  isolatedCheckoutLifecycleEnvironment,
  simulateCheckoutConfiguration,
} from "../helpers/checkout-lifecycle-fixture";
import { configureNativeFinanceDatabaseTls } from "../helpers/native-finance-database-tls";
import { assertNativeFinanceRedis } from "../helpers/native-finance-redis-guard";

if (process.env.PAYMENT_RELEASE_SETTINGS_TESTS !== "disposable-local") {
  describe.skip("Payment release settings HTTP (reserved disposable environment required)", () => {
    it("requires the explicit opt-in and isolated TLS infrastructure", () => {});
  });
} else {
  isolatedCheckoutLifecycleEnvironment();
  assertNativeFinanceRedis(process.env);
  const dbName = `closure_finance_durability_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME!)}:${encodeURIComponent(process.env.DB_PASSWORD!)}@localhost:55432/${dbName}`;
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        assertLifecycleBootstrap(container, dbName);
        const configuration = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        assertNativeFinanceRedis(process.env, configuration);
        configureNativeFinanceDatabaseTls(configuration, dbName);
      },
    },
    testSuite: ({ api, getContainer }) => {
      type Actor = { token: string; userId?: string };
      type Grant = {
        resource: "store" | "payment";
        operation: (typeof PolicyOperation)[keyof typeof PolicyOperation];
      };
      const readGrant: Grant = {
        resource: "store",
        operation: PolicyOperation.read,
      };
      const storeUpdateGrant: Grant = {
        resource: "store",
        operation: PolicyOperation.update,
      };
      const paymentUpdateGrant: Grant = {
        resource: "payment",
        operation: PolicyOperation.update,
      };
      const auth = () =>
        getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const stores = () =>
        getContainer().resolve<IStoreModuleService>(Modules.STORE);
      const capture = {
        mode: "automatic",
        revision: randomUUID(),
        actor_id: "user_fixture_capture",
      };
      let storeId: string;

      async function request<T = Record<string, unknown>>(
        method: "GET" | "POST",
        url: string,
        actor?: Actor,
        data?: object,
      ) {
        const response = await api.request({
          method,
          url,
          data,
          headers: actor ? { authorization: `Bearer ${actor.token}` } : {},
          validateStatus: () => true,
        });
        return {
          status: response.status as number,
          data: response.data as T,
          headers: response.headers,
        };
      }
      async function identity() {
        const email = `release-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registered = await auth().register("emailpass", {
          body: { email, password },
        });
        if (!registered.success || !registered.authIdentity)
          throw new Error("Native identity fixture registration failed.");
        const id = registered.authIdentity.id;
        const verification = await auth().requestAuthVerification({
          auth_identity_id: id,
          entity_id: email,
          entity_type: "email",
          code_provider: "token",
        });
        if (!verification.code)
          throw new Error(
            "Native identity fixture verification returned no code.",
          );
        await auth().confirmAuthVerification({
          code: verification.code,
          auth_identity_id: id,
        });
        return { id, email, password };
      }
      async function login(
        actor: "user" | "member",
        account: Awaited<ReturnType<typeof identity>>,
      ) {
        const response = await request<{ token: string }>(
          "POST",
          `/auth/${actor}/emailpass`,
          undefined,
          { email: account.email, password: account.password },
        );
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token;
      }
      async function operator(
        grants: Grant[] = [readGrant, storeUpdateGrant, paymentUpdateGrant],
      ): Promise<Actor & { userId: string }> {
        const account = await identity();
        const rbac = getContainer().resolve(Modules.RBAC);
        const policyIds: string[] = [];
        for (const grant of grants) {
          const existing = await rbac.listRbacPolicies(grant);
          if (existing.length)
            policyIds.push(...existing.map((policy) => policy.id));
          else {
            const { result } = await createRbacPoliciesWorkflow(
              getContainer(),
            ).run({ input: { policies: [{ ...grant, key: `${grant.resource}:${grant.operation}` }] } });
            policyIds.push(...result.map((policy) => policy.id));
          }
        }
        const { result: roles } = await createRbacRolesWorkflow(
          getContainer(),
        ).run({
          input: {
            roles: [{ name: `release-${randomUUID()}`, policy_ids: policyIds }],
          },
        });
        const { result: users } = await createUsersWorkflow(getContainer()).run(
          {
            input: { users: [{ email: account.email, roles: [roles[0].id] }] },
          },
        );
        await auth().updateAuthIdentities({
          id: account.id,
          app_metadata: { user_id: users[0].id },
        });
        return { userId: users[0].id, token: await login("user", account) };
      }
      async function vendor(): Promise<Actor> {
        const account = await identity();
        await createSellerAccountWorkflow(getContainer()).run({
          input: {
            auth_identity_id: account.id,
            member_email: account.email,
            seller: {
              name: `Release fixture ${randomUUID()}`,
              handle: `release-${randomUUID()}`,
              email: account.email,
              currency_code: "usd",
            },
          },
        });
        return { token: await login("member", account) };
      }
      async function currentStore() {
        return stores().retrieveStore(storeId);
      }
      async function settings(actor: Actor) {
        const response = await request<PaymentReleaseSettingsResponse>(
          "GET",
          "/admin/payment-release-settings",
          actor,
        );
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        return response.data;
      }
      async function assertNoOrders() {
        const result = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph(
            { entity: "order", fields: ["id"], pagination: { take: 1 } },
            { cache: { enable: false } },
          );
        expect(result.data).toHaveLength(0);
      }
      beforeEach(async () => {
        simulateCheckoutConfiguration(false);
        process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
        process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
        const all = await stores().listStores({}, { take: 2, select: ["id"] });
        expect(all).toHaveLength(1);
        storeId = all[0].id;
        await updateStoresWorkflow(getContainer()).run({
          input: {
            selector: { id: storeId },
            update: {
              metadata: {
                unrelated_fixture: "preserved",
                [CAPTURE_SETTINGS_METADATA_KEY]: capture,
              },
            },
          },
        });
        await assertNoOrders();
      });
      afterEach(async () => {
        simulateCheckoutConfiguration(false);
        process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
        process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
        await assertNoOrders();
      });

      it("requires a user session and store.read for private settings", async () => {
        expect(
          (await request("GET", "/admin/payment-release-settings")).status,
        ).toBe(401);
        expect(
          (
            await request(
              "GET",
              "/admin/payment-release-settings",
              await vendor(),
            )
          ).status,
        ).toBe(401);
        const noRead = await operator([storeUpdateGrant, paymentUpdateGrant]);
        expect(
          (await request("GET", "/admin/payment-release-settings", noRead))
            .status,
        ).toBe(403);
        expect(await settings(await operator([readGrant]))).toEqual({
          settings: {
            mode: "manual",
            delay_days: 3,
            revision: "initial:manual",
          },
          automatic_available: false,
        });
      });

      it("requires both store.update and payment.update for saving", async () => {
        const body = {
          mode: "manual",
          delay_days: 3,
          expected_revision: "initial:manual",
        };
        expect(
          (
            await request(
              "POST",
              "/admin/payment-release-settings",
              undefined,
              body,
            )
          ).status,
        ).toBe(401);
        expect(
          (
            await request(
              "POST",
              "/admin/payment-release-settings",
              await vendor(),
              body,
            )
          ).status,
        ).toBe(401);
        for (const grants of [
          [readGrant],
          [readGrant, storeUpdateGrant],
          [readGrant, paymentUpdateGrant],
        ]) {
          const response = await request(
            "POST",
            "/admin/payment-release-settings",
            await operator(grants),
            body,
          );
          expect(response.status).toBe(403);
        }
        expect((await currentStore()).metadata).toEqual({
          unrelated_fixture: "preserved",
          [CAPTURE_SETTINGS_METADATA_KEY]: capture,
        });
      });

      it("keeps Manual usable without Stripe and rejects enabling unavailable automation", async () => {
        const actor = await operator();
        const response = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "manual",
            delay_days: 3,
            expected_revision: "initial:manual",
          },
        );
        expect(response.status).toBe(200);
        expect(response.data).toEqual({
          settings: {
            mode: "manual",
            delay_days: 3,
            revision: "initial:manual",
          },
          automatic_available: false,
        });
        const rejected = await request(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "automatic",
            delay_days: 3,
            expected_revision: "initial:manual",
          },
        );
        expect(rejected.status).toBe(400);
        expect(
          (await currentStore()).metadata?.[RELEASE_SETTINGS_METADATA_KEY],
        ).toBeUndefined();
        expect(await automaticSettlementEnabled(getContainer())).toBe(false);
      });

      it("persists Automatic despite legacy env=false and preserves capture/unrelated settings", async () => {
        const actor = await operator();
        // Simulates configuration validation only, after provider-free bootstrap.
        // No account, order, payment adapter or Stripe object is created.
        simulateCheckoutConfiguration(true);
        const before = await settings(actor);
        expect(before.automatic_available).toBe(true);
        const saved = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "automatic",
            delay_days: 3,
            expected_revision: before.settings.revision,
          },
        );
        expect(saved.status).toBe(200);
        expect(saved.data.settings.mode).toBe("automatic");
        expect(saved.data.settings.revision).toMatch(/^[a-f0-9-]{36}$/);
        expect(saved.data.automatic_available).toBe(true);
        expect(process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED).toBe("false");
        expect(await automaticSettlementEnabled(getContainer())).toBe(true);
        expect((await currentStore()).metadata).toEqual({
          unrelated_fixture: "preserved",
          [CAPTURE_SETTINGS_METADATA_KEY]: capture,
          [RELEASE_SETTINGS_METADATA_KEY]: {
            mode: "automatic",
            delay_days: 3,
            revision: saved.data.settings.revision,
            actor_id: actor.userId,
          },
        });
        expect(await settings(actor)).toEqual(saved.data);
        const manual = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "manual",
            delay_days: 3,
            expected_revision: saved.data.settings.revision,
          },
        );
        expect(manual.status).toBe(200);
        expect(manual.data.settings.mode).toBe("manual");
        expect(manual.data.settings.revision).not.toBe(
          saved.data.settings.revision,
        );
        process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "true";
        expect(await automaticSettlementEnabled(getContainer())).toBe(false);
        expect(
          (await currentStore()).metadata?.[CAPTURE_SETTINGS_METADATA_KEY],
        ).toEqual(capture);
      });

      it("rejects stale revisions and invalid input without replacing the saved choice", async () => {
        const actor = await operator();
        simulateCheckoutConfiguration(true);
        const saved = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "automatic",
            delay_days: 3,
            expected_revision: "initial:manual",
          },
        );
        expect(saved.status).toBe(200);
        const stale = await request(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "manual",
            delay_days: 3,
            expected_revision: "initial:manual",
          },
        );
        expect(stale.status).toBe(409);
        for (const body of [
          {
            mode: "invalid",
            delay_days: 3,
            expected_revision: saved.data.settings.revision,
          },
          { mode: "manual", delay_days: 3 },
          {
            mode: "manual",
            delay_days: 3,
            expected_revision: saved.data.settings.revision,
            actor_id: actor.userId,
          },
        ]) {
          expect(
            (
              await request(
                "POST",
                "/admin/payment-release-settings",
                actor,
                body,
              )
            ).status,
          ).toBe(400);
        }
        expect(await settings(actor)).toEqual(saved.data);
      });

      it("keeps Automatic enabled with zero days and saves a new delay without changing the mode", async () => {
        const actor = await operator();
        simulateCheckoutConfiguration(true);
        const immediate = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "automatic",
            delay_days: 0,
            expected_revision: "initial:manual",
          },
        );
        expect(immediate.status).toBe(200);
        expect(immediate.data.settings.delay_days).toBe(0);
        expect(immediate.data.automatic_available).toBe(true);
        expect(await settings(actor)).toEqual(immediate.data);
        expect(await automaticSettlementEnabled(getContainer())).toBe(true);
        const changed = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "automatic",
            delay_days: 2,
            expected_revision: immediate.data.settings.revision,
          },
        );
        expect(changed.status).toBe(200);
        expect(changed.data.settings.mode).toBe("automatic");
        expect(changed.data.settings.delay_days).toBe(2);
        expect(changed.data.settings.revision).not.toBe(
          immediate.data.settings.revision,
        );
        expect(await automaticSettlementEnabled(getContainer())).toBe(true);
        expect((await currentStore()).metadata).toEqual({
          unrelated_fixture: "preserved",
          [CAPTURE_SETTINGS_METADATA_KEY]: capture,
          [RELEASE_SETTINGS_METADATA_KEY]: {
            ...changed.data.settings,
            actor_id: actor.userId,
          },
        });
      });

      it.each([0, 1, 2, 3])(
        "saves a %i-day delay in Manual mode and preserves a repeated save",
        async (delayDays) => {
          const actor = await operator();
          const previous = await request<PaymentReleaseSettingsResponse>(
            "POST",
            "/admin/payment-release-settings",
            actor,
            {
              mode: "manual",
              delay_days: 365,
              expected_revision: "initial:manual",
            },
          );
          expect(previous.status).toBe(200);
          expect(previous.data.settings.delay_days).toBe(365);
          const saved = await request<PaymentReleaseSettingsResponse>(
            "POST",
            "/admin/payment-release-settings",
            actor,
            {
              mode: "manual",
              delay_days: delayDays,
              expected_revision: previous.data.settings.revision,
            },
          );
          expect(saved.status).toBe(200);
          expect(saved.data.settings).toEqual({
            mode: "manual",
            delay_days: delayDays,
            revision: expect.any(String),
          });
          expect(saved.data.settings.revision).not.toBe(
            previous.data.settings.revision,
          );
          expect(saved.data.automatic_available).toBe(false);
          const metadata = (await currentStore()).metadata;
          expect(metadata).toEqual({
            unrelated_fixture: "preserved",
            [CAPTURE_SETTINGS_METADATA_KEY]: capture,
            [RELEASE_SETTINGS_METADATA_KEY]: {
              ...saved.data.settings,
              actor_id: actor.userId,
            },
          });
          expect(await settings(actor)).toEqual(saved.data);
          const repeated = await request<PaymentReleaseSettingsResponse>(
            "POST",
            "/admin/payment-release-settings",
            actor,
            {
              mode: "manual",
              delay_days: delayDays,
              expected_revision: saved.data.settings.revision,
            },
          );
          expect(repeated.status).toBe(200);
          expect(repeated.data).toEqual(saved.data);
          expect((await currentStore()).metadata).toEqual(metadata);
          expect(await automaticSettlementEnabled(getContainer())).toBe(false);
        },
      );

      it("requires a numeric integer delay from 0 through 365 without changing saved settings", async () => {
        const actor = await operator();
        const before = await currentStore();
        for (const delayDays of [-1, 366, 1.5, "2", null, false]) {
          const response = await request(
            "POST",
            "/admin/payment-release-settings",
            actor,
            {
              mode: "manual",
              delay_days: delayDays,
              expected_revision: "initial:manual",
            },
          );
          expect(response.status).toBe(400);
          expect((await currentStore()).metadata).toEqual(before.metadata);
        }
        expect(
          (
            await request("POST", "/admin/payment-release-settings", actor, {
              mode: "manual",
              expected_revision: "initial:manual",
            })
          ).status,
        ).toBe(400);
        expect((await currentStore()).metadata).toEqual(before.metadata);
        expect((await settings(actor)).settings.delay_days).toBe(3);
      });

      it("reads legacy saved metadata as three days without changing its revision or stored fields", async () => {
        const actor = await operator();
        const revision = randomUUID();
        const metadata = {
          unrelated_fixture: "preserved",
          [CAPTURE_SETTINGS_METADATA_KEY]: capture,
          [RELEASE_SETTINGS_METADATA_KEY]: {
            mode: "manual",
            revision,
            actor_id: actor.userId,
          },
        };
        await updateStoresWorkflow(getContainer()).run({
          input: { selector: { id: storeId }, update: { metadata } },
        });
        const legacy = await settings(actor);
        expect(legacy.settings).toEqual({
          mode: "manual",
          delay_days: 3,
          revision,
        });
        expect((await currentStore()).metadata).toEqual(metadata);
        const repeated = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          { mode: "manual", delay_days: 3, expected_revision: revision },
        );
        expect(repeated.status).toBe(200);
        expect(repeated.data).toEqual(legacy);
        expect((await currentStore()).metadata).toEqual(metadata);
        const changed = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          { mode: "manual", delay_days: 2, expected_revision: revision },
        );
        expect(changed.status).toBe(200);
        expect(changed.data.settings.delay_days).toBe(2);
        expect(changed.data.settings.revision).not.toBe(revision);
        expect((await currentStore()).metadata).toEqual({
          ...metadata,
          [RELEASE_SETTINGS_METADATA_KEY]: {
            ...changed.data.settings,
            actor_id: actor.userId,
          },
        });
      });

      it("serializes concurrent delay changes while retaining Manual mode", async () => {
        const actors = [await operator(), await operator()];
        const responses = await Promise.all(
          actors.map((actor, index) =>
            request<PaymentReleaseSettingsResponse>(
              "POST",
              "/admin/payment-release-settings",
              actor,
              {
                mode: "manual",
                delay_days: index + 1,
                expected_revision: "initial:manual",
              },
            ),
          ),
        );
        expect(responses.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const accepted = responses.findIndex(
          (response) => response.status === 200,
        );
        expect(responses[accepted].data.settings.delay_days).toBe(accepted + 1);
        expect((await currentStore()).metadata).toEqual({
          unrelated_fixture: "preserved",
          [CAPTURE_SETTINGS_METADATA_KEY]: capture,
          [RELEASE_SETTINGS_METADATA_KEY]: {
            ...responses[accepted].data.settings,
            actor_id: actors[accepted].userId,
          },
        });
      });

      it("serializes concurrent saves from the same revision", async () => {
        simulateCheckoutConfiguration(true);
        const actors = [await operator(), await operator()];
        const responses = await Promise.all(
          actors.map((actor) =>
            request<PaymentReleaseSettingsResponse>(
              "POST",
              "/admin/payment-release-settings",
              actor,
              {
                mode: "automatic",
                delay_days: 3,
                expected_revision: "initial:manual",
              },
            ),
          ),
        );
        expect(responses.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const accepted = responses.findIndex(
          (response) => response.status === 200,
        );
        expect(
          (await currentStore()).metadata?.[RELEASE_SETTINGS_METADATA_KEY],
        ).toEqual({
          ...responses[accepted].data.settings,
          actor_id: actors[accepted].userId,
        });
      });

      it("holds an owner-only Redis lock without expiry and blocks both settings editors", async () => {
        const actor = await operator();
        const before = await currentStore();
        const locking = getContainer().resolve<ILockingModule>(Modules.LOCKING);
        const acquire = jest.spyOn(locking, "acquire");
        const release = jest.spyOn(locking, "release");
        const redis = new Redis(process.env.REDIS_URL!, {
          ...REDIS_CONNECTION_OPTIONS,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
        // The installed native provider uses this prefix; configuration above
        // is guarded against a namespace or alternate Redis connection.
        const key = `medusa_lock:${CAPTURE_SETTINGS_LOCK_KEY}`;
        let ownerId: string | undefined;
        try {
          await redis.connect();
          await withPaymentSettingsLock(getContainer(), async () => {
            const calls = acquire.mock.calls.filter(
              ([keys]) => keys === CAPTURE_SETTINGS_LOCK_KEY,
            );
            expect(calls).toHaveLength(1);
            ownerId = calls[0][1]?.ownerId ?? undefined;
            expect(ownerId).toMatch(/^[a-f0-9-]{36}$/);
            expect(calls[0][1]).toEqual({ ownerId });
            expect(await redis.get(key)).toBe(ownerId);
            expect(await redis.pttl(key)).toBe(-1);
            expect(
              await locking.release(CAPTURE_SETTINGS_LOCK_KEY, {
                ownerId: randomUUID(),
              }),
            ).toBe(false);
            expect(await redis.get(key)).toBe(ownerId);
            for (const [url, body] of [
              [
                "/admin/payment-release-settings",
                {
                  mode: "manual",
                  delay_days: 3,
                  expected_revision: "initial:manual",
                },
              ],
              [
                "/admin/payment-capture-settings",
                { mode: "manual", expected_revision: capture.revision },
              ],
            ] as const) {
              expect((await request("POST", url, actor, body)).status).toBe(
                409,
              );
            }
            expect((await currentStore()).metadata).toEqual(before.metadata);
            expect(await redis.pttl(key)).toBe(-1);
          });
          expect(release).toHaveBeenLastCalledWith(CAPTURE_SETTINGS_LOCK_KEY, {
            ownerId,
          });
          expect(await redis.pttl(key)).toBe(-2);
        } finally {
          acquire.mockRestore();
          release.mockRestore();
          await redis.quit();
        }
      });

      it("prevents all native Store metadata replacements while allowing native name updates", async () => {
        const actor = await operator([readGrant, storeUpdateGrant]);
        const before = await currentStore();
        for (const metadata of [
          null,
          {},
          { unrelated: "overwrite" },
          {
            [RELEASE_SETTINGS_METADATA_KEY]: {
              mode: "automatic",
              delay_days: 0,
              revision: randomUUID(),
              actor_id: actor.userId,
            },
          },
          { [CAPTURE_SETTINGS_METADATA_KEY]: null },
        ]) {
          expect(
            (
              await request("POST", `/admin/stores/${storeId}`, actor, {
                metadata,
              })
            ).status,
          ).toBe(400);
          expect((await currentStore()).metadata).toEqual(before.metadata);
        }
        const renamed = await request(
          "POST",
          `/admin/stores/${storeId}`,
          actor,
          { name: "Disposable release settings store" },
        );
        expect(renamed.status).toBe(200);
        expect((await currentStore()).name).toBe(
          "Disposable release settings store",
        );
        expect((await currentStore()).metadata).toEqual(before.metadata);
      });

      it("retains the TEST and general-jobs guard when an automatic mode is saved", async () => {
        const actor = await operator();
        simulateCheckoutConfiguration(true);
        const saved = await request<PaymentReleaseSettingsResponse>(
          "POST",
          "/admin/payment-release-settings",
          actor,
          {
            mode: "automatic",
            delay_days: 3,
            expected_revision: "initial:manual",
          },
        );
        expect(saved.status).toBe(200);
        process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "true";
        expect(await automaticSettlementEnabled(getContainer())).toBe(false);
        expect((await settings(actor)).automatic_available).toBe(false);
        process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
        process.env.STRIPE_API_KEY = "sk_live_LocalFixture";
        expect(await automaticSettlementEnabled(getContainer())).toBe(false);
        expect((await settings(actor)).automatic_available).toBe(false);
        expect(
          (await currentStore()).metadata?.[RELEASE_SETTINGS_METADATA_KEY],
        ).toEqual({ ...saved.data.settings, actor_id: actor.userId });
      });
    },
  });
}
