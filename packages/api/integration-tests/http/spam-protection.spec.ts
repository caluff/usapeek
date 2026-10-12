/** Explicit disposable TLS PostgreSQL/Redis only; no external mail providers. */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/core-flows";
import type { IAuthModuleService } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils";
import type SpamProtectionService from "../../src/modules/spam-protection/service";
import { SPAM_PROTECTION_MODULE } from "../../src/modules/spam-protection";
import {
  assertLifecycleBootstrap,
  isolatedCheckoutLifecycleEnvironment,
} from "../helpers/checkout-lifecycle-fixture";

if (process.env.SPAM_PROTECTION_TESTS !== "disposable-local") {
  describe.skip("Spam protection (requires disposable-local)", () => {
    it("requires the reserved disposable TLS infrastructure", () => {});
  });
} else {
  const dbName = isolatedCheckoutLifecycleEnvironment();
  jest.setTimeout(180_000);
  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) =>
        assertLifecycleBootstrap(container, dbName),
    },
    testSuite: ({ api, getContainer }) => {
      const limiter = () =>
        getContainer().resolve<SpamProtectionService>(SPAM_PROTECTION_MODULE);

      it("atomically limits concurrent requests and releases the budget after expiry", async () => {
        const bucket = {
          scope: "integration-concurrency",
          subject: randomUUID(),
          limit: 3,
          windowSeconds: 2,
        };
        const results = await Promise.all(
          Array.from({ length: 20 }, () => limiter().consume([bucket])),
        );
        expect(results.filter((value) => value === 0)).toHaveLength(3);
        expect(results.filter((value) => value > 0)).toHaveLength(17);
        expect(Math.max(...results)).toBeLessThanOrEqual(2);
        await new Promise((resolve) => setTimeout(resolve, 2100));
        expect(await limiter().consume([bucket])).toBe(0);
      });

      it("does not consume a fresh budget when a second budget rejects the request", async () => {
        const blocked = {
          scope: "integration-atomic",
          subject: randomUUID(),
          limit: 1,
          windowSeconds: 60,
        };
        const fresh = { ...blocked, subject: randomUUID() };
        expect(await limiter().consume([blocked])).toBe(0);
        expect(await limiter().consume([fresh, blocked])).toBeGreaterThan(0);
        expect(await limiter().consume([fresh])).toBe(0);
        expect(await limiter().consume([fresh])).toBeGreaterThan(0);
      });

      it("limits direct native logins without changing the native authentication response", async () => {
        const email = `spam-login-${randomUUID()}@example.invalid`;
        for (let index = 0; index < 12; index++) {
          await expect(
            api.post("/auth/customer/emailpass", {
              email,
              password: "invalid-password",
            }),
          ).rejects.toMatchObject({ response: { status: 401 } });
        }
        await expect(
          api.post("/AUTH/%63ustomer/%65mailpass", {
            email,
            password: "invalid-password",
          }),
        ).rejects.toMatchObject({
          response: {
            status: 429,
            headers: { "retry-after": expect.any(String) },
            data: { code: "too_many_requests" },
          },
        });
      });

      it("shares reset cooldowns across actor types without revealing account existence", async () => {
        const identifier = `spam-reset-${randomUUID()}@example.invalid`;
        expect(
          (
            await api.post("/auth/customer/emailpass/reset-password", {
              identifier,
            })
          ).status,
        ).toBe(201);
        await expect(
          api.post("/auth/user/emailpass/reset-password", {
            identifier: identifier.toUpperCase(),
          }),
        ).rejects.toMatchObject({
          response: {
            status: 429,
            headers: { "retry-after": expect.any(String) },
          },
        });
      });

      it("uses authenticated identity budgets before native and panel verification workflows", async () => {
        const auth = getContainer().resolve<IAuthModuleService>(Modules.AUTH);
        const email = `spam-verify-${randomUUID()}@example.invalid`;
        const identity = await auth.createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
        });
        const { result } = await createUserAccountWorkflow(getContainer()).run({
          input: { authIdentityId: identity.id, userData: { email } },
        });
        const { http } = getContainer().resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        ).projectConfig;
        const token = generateJwtToken(
          {
            actor_id: result.id,
            actor_type: "user",
            auth_identity_id: identity.id,
            auth_provider: "emailpass",
            app_metadata: {},
          },
          {
            secret: http.jwtSecret,
            expiresIn: "10m",
            jwtOptions: http.jwtOptions,
          },
        );
        const options = { headers: { authorization: `Bearer ${token}` } };
        const bucket = {
          scope: "verification-identity-hour",
          subject: identity.id,
          limit: 5,
          windowSeconds: 3600,
        };
        for (let index = 0; index < 5; index++)
          expect(await limiter().consume([bucket])).toBe(0);
        await expect(
          api.post(
            "/auth/verification/request",
            {
              entity_id: `changed-${randomUUID()}@example.invalid`,
              entity_type: "email",
              code_provider: "token",
            },
            options,
          ),
        ).rejects.toMatchObject({ response: { status: 429 } });
        await expect(
          api.post("/auth/account/email-verification/request", {}, options),
        ).rejects.toMatchObject({ response: { status: 429 } });
        expect(
          await auth.listAuthVerifications({ auth_identity_id: identity.id }),
        ).toEqual([]);
        await expect(
          api.post("/auth/account/email-verification/request", {}),
        ).rejects.toMatchObject({ response: { status: 401 } });
      });
    },
  });
}
