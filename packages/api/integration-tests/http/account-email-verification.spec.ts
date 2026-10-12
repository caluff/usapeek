/** Isolated PostgreSQL and TLS Redis only; no real OAuth, actors or emails. */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/core-flows";
import type AuthModule from "@medusajs/medusa/auth";
import type { IAuthModuleService, IEventBusModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils";
import { createSellerAccountWorkflow } from "@mercurjs/core/workflows";
if (process.env.ACCOUNT_EMAIL_VERIFICATION_TESTS !== "disposable-local") {
  describe.skip("Account email verification HTTP integration (requires disposable-local)", () => {
    it("requires isolated PostgreSQL and TLS Redis; see file header", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" || !process.env.DB_USERNAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
    throw new Error("Account email verification tests require explicit disposable localhost PostgreSQL credentials and NODE_ENV=test.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || !redis.username || !redis.password || !/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)) {
    throw new Error("Account email verification tests require a dedicated localhost TLS Redis instance with a nonzero database.");
  }
  if (process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) throw new Error("Remove DB_TEMP_NAME and MEDUSA_DB_SCHEMA; this suite owns its disposable database.");
  const dbName = `email_verification_test_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.AUTH_MFA_ENCRYPTION_KEY = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async container => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        if (new URL(config.projectConfig.databaseUrl!).pathname !== `/${dbName}`) throw new Error("Application database does not match the disposable email verification test database.");
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) => typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Use only local/mock notifications in the disposable email verification test configuration.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const endpoint = "/auth/account/email-verification";
      function headers(identityId: string, actorId: string, actorType: string = "user") {
        const { http } = getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig;
        const token = generateJwtToken({ actor_id: actorId, actor_type: actorType, auth_identity_id: identityId, auth_provider: "emailpass", app_metadata: {} }, { secret: http.jwtSecret, expiresIn: "10m", jwtOptions: http.jwtOptions });
        return { authorization: `Bearer ${token}` };
      }
      async function account(actorType: "user" | "member", googleEmail?: string, email = `verify-${randomUUID()}@gmail.com`, googleOnly = false) {
        const identity = await auth().createAuthIdentities({ provider_identities: [...(!googleOnly ? [{ provider: "emailpass", entity_id: email }] : []), ...(googleEmail ? [{ provider: actorType === "user" ? "google-admin" : "google", entity_id: randomUUID(), user_metadata: { email: googleEmail === "same" ? email : googleEmail } }] : [])] });
        if (actorType === "user") {
          const { result } = await createUserAccountWorkflow(getContainer()).run({ input: { authIdentityId: identity.id, userData: { email } } });
          return { identityId: identity.id, email, actorId: result.id, actorType };
        }
        await createSellerAccountWorkflow(getContainer()).run({ input: { auth_identity_id: identity.id, member_email: email, seller: { name: `Email fixture ${randomUUID()}`, handle: `email-fixture-${randomUUID()}`, email, currency_code: "usd" } } });
        const bound = await auth().retrieveAuthIdentity(identity.id);
        if (typeof bound.app_metadata?.member_id !== "string") throw new Error("Native member fixture was not bound");
        return { identityId: identity.id, email, actorId: bound.app_metadata.member_id, actorType };
      }
      async function proof(identityId: string, email: string) {
        const verification = await auth().requestAuthVerification({ auth_identity_id: identityId, entity_id: email, entity_type: "email", code_provider: "token" });
        if (!verification.id || !verification.code) throw new Error("Native verification fixture did not return a code");
        return { ...verification, id: verification.id, code: verification.code };
      }
      const requestOptions = (value: Awaited<ReturnType<typeof account>>) => ({ headers: headers(value.identityId, value.actorId, value.actorType) });

      it("requires a full panel session and rejects customers", async () => {
        await expect(api.get(endpoint)).rejects.toMatchObject({ response: { status: 401 } });
        const value = await account("user");
        for (const options of [{ headers: headers(value.identityId, "") }, { headers: headers(value.identityId, value.actorId, "customer") }]) {
          await expect(api.get(endpoint, options)).rejects.toMatchObject({ response: { status: 401 } });
          await expect(api.post(`${endpoint}/request`, {}, options)).rejects.toMatchObject({ response: { status: 401 } });
        }
      });

      it.each(["user", "member"] as const)("reads native %s email verification and confirms without ending the session", async actorType => {
        const value = await account(actorType);
        const options = requestOptions(value);
        const pending = await api.get(endpoint, options);
        expect(pending.data).toEqual({ email: value.email, status: "unverified", source: null });
        expect(pending.headers["cache-control"]).toBe("no-store");
        const verification = await proof(value.identityId, value.email);
        expect((await api.get(endpoint, options)).data.status).toBe("unverified");
        const confirmed = await api.post(`${endpoint}/confirm`, { code: verification.code }, options);
        expect(confirmed.data).toEqual({ email: value.email, status: "verified", source: "email" });
        expect((await api.get(endpoint, options)).data).toEqual(confirmed.data);
        await expect(api.post(`${endpoint}/confirm`, { code: verification.code }, options)).rejects.toMatchObject({ response: { status: 400 } });
      });

      it.each(["user", "member"] as const)("recognizes signed Google proof for the current %s email", async actorType => {
        const verified = await account(actorType, "same");
        expect((await api.get(endpoint, requestOptions(verified))).data).toEqual({ email: verified.email, status: "verified", source: "google" });
        const differentEmail = await account(actorType, "different@example.invalid");
        expect((await api.get(endpoint, requestOptions(differentEmail))).data).toEqual({ email: differentEmail.email, status: "unverified", source: null });
        const externalEmail = await account(actorType, "same", `external-${randomUUID()}@example.invalid`);
        expect((await api.get(endpoint, requestOptions(externalEmail))).data).toEqual({ email: externalEmail.email, status: "unverified", source: null });
      });

      it("refuses another account's code before mutating either verification", async () => {
        const owner = await account("user");
        const other = await account("member");
        const verification = await proof(owner.identityId, owner.email);
        await expect(api.post(`${endpoint}/confirm`, { code: verification.code }, requestOptions(other))).rejects.toMatchObject({ response: { status: 400 } });
        expect((await auth().retrieveAuthVerification(verification.id)).verified_at).toBeNull();
        expect((await api.get(endpoint, requestOptions(other))).data.status).toBe("unverified");
        expect((await api.post(`${endpoint}/confirm`, { code: verification.code }, requestOptions(owner))).data.status).toBe("verified");
      });

      it("rejects proof for a different email on the same identity", async () => {
        const value = await account("user");
        const verification = await proof(value.identityId, `different-${randomUUID()}@example.invalid`);
        await expect(api.post(`${endpoint}/confirm`, { code: verification.code }, requestOptions(value))).rejects.toMatchObject({ response: { status: 400 } });
        expect((await auth().retrieveAuthVerification(verification.id)).verified_at).toBeNull();
      });

      it("refuses codes across distinct operator/vendor identities even with the same Gmail", async () => {
        const owner = await account("user");
        const other = await account("member", "same", owner.email, true);
        const verification = await proof(owner.identityId, owner.email);
        await expect(api.post(`${endpoint}/confirm`, { code: verification.code }, requestOptions(other))).rejects.toMatchObject({ response: { status: 400 } });
        expect((await auth().retrieveAuthVerification(verification.id)).verified_at).toBeNull();
      });

      it("rejects a session whose actor binding has changed", async () => {
        const value = await account("user");
        const wrongActor = await account("user");
        await expect(api.get(endpoint, { headers: headers(value.identityId, wrongActor.actorId) })).rejects.toMatchObject({ response: { status: 401 } });
      });

      it("preserves native rejection of an expired verification code", async () => {
        const value = await account("user");
        const verification = await proof(value.identityId, value.email);
        await getContainer().resolve<InstanceType<typeof AuthModule.service>>(Modules.AUTH).updateAuthVerifications({ id: verification.id, requested_at: new Date(0) });
        await expect(api.post(`${endpoint}/confirm`, { code: verification.code }, requestOptions(value))).rejects.toMatchObject({ response: { status: 400 } });
        expect((await auth().retrieveAuthVerification(verification.id)).verified_at).toBeNull();
      });

      it("does not report mail sent when email delivery is disabled", async () => {
        const value = await account("user");
        await expect(api.post(`${endpoint}/request`, {}, requestOptions(value))).rejects.toMatchObject({ response: { status: 400 } });
        expect(await auth().listAuthVerifications({ auth_identity_id: value.identityId })).toEqual([]);
      });

      it("requests the session email through the native workflow without delivering test email", async () => {
        const value = await account("user");
        const eventBus = getContainer().resolve<IEventBusModuleService>(Modules.EVENT_BUS);
        const emit = jest.spyOn(eventBus, "emit").mockResolvedValue(undefined);
        const previous = { enabled: process.env.AUTH_EMAIL_ENABLED, sender: process.env.RESEND_FROM_EMAIL, key: process.env.RESEND_API_KEY };
        process.env.AUTH_EMAIL_ENABLED = "true";
        process.env.RESEND_FROM_EMAIL = "fixture@example.invalid";
        process.env.RESEND_API_KEY = "re_disposable_fixture";
        try {
          expect((await api.post(`${endpoint}/request`, {}, requestOptions(value))).data).toEqual({ status: "requested" });
          expect(emit).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "auth.verification_requested", data: expect.objectContaining({ entity_id: value.email, auth_identity_id: value.identityId, metadata: { actor_type: "user" }, code: expect.any(String) }) })]));
          expect(await auth().listAuthVerifications({ auth_identity_id: value.identityId, entity_id: value.email })).toHaveLength(1);
          await expect(api.post(`${endpoint}/request`, { entity_id: "another@example.invalid" }, requestOptions(value))).rejects.toMatchObject({ response: { status: 400 } });
        } finally {
          process.env.AUTH_EMAIL_ENABLED = previous.enabled;
          process.env.RESEND_FROM_EMAIL = previous.sender;
          process.env.RESEND_API_KEY = previous.key;
          emit.mockRestore();
        }
      });

      it("preserves legacy emailpass casing across request, confirmation and native verification policy", async () => {
        const value = await account("user", undefined, `Legacy-${randomUUID()}@Example.invalid`);
        const options = requestOptions(value);
        const eventBus = getContainer().resolve<IEventBusModuleService>(Modules.EVENT_BUS);
        const emit = jest.spyOn(eventBus, "emit").mockResolvedValue(undefined);
        const { http } = getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig;
        const previousPolicy = http.authVerificationsPerActor;
        const previous = { enabled: process.env.AUTH_EMAIL_ENABLED, sender: process.env.RESEND_FROM_EMAIL, key: process.env.RESEND_API_KEY };
        process.env.AUTH_EMAIL_ENABLED = "true";
        process.env.RESEND_FROM_EMAIL = "fixture@example.invalid";
        process.env.RESEND_API_KEY = "re_disposable_fixture";
        http.authVerificationsPerActor = { user: [{ auth_provider: "emailpass", entity_type: "email" }] };
        try {
          expect((await api.get(endpoint, options)).data.email).toBe(value.email);
          const refreshOptions = { headers: headers(value.identityId, "") };
          const pending = await api.post("/auth/token/refresh", {}, refreshOptions);
          expect(pending.data.verification_required).toBe(true);
          expect((await api.post(`${endpoint}/request`, {}, options)).data.status).toBe("requested");
          expect((await api.post("/auth/token/refresh", {}, refreshOptions)).data.verification.entity_id).toBe(value.email);
          const events = emit.mock.calls.flatMap(call => Array.isArray(call[0]) ? call[0] : [call[0]]);
          const event = events.find(entry => entry.name === "auth.verification_requested");
          const data = event?.data as { code?: unknown; entity_id?: unknown } | undefined;
          if (typeof data?.code !== "string") throw new Error("Native workflow did not emit a verification code");
          expect(data.entity_id).toBe(value.email);
          expect((await api.post(`${endpoint}/confirm`, { code: data.code }, options)).data).toEqual({ email: value.email, status: "verified", source: "email" });
          const refreshed = await api.post("/auth/token/refresh", {}, refreshOptions);
          expect(refreshed.data.verification_required).toBeUndefined();
          expect(refreshed.data.token).toEqual(expect.any(String));
        } finally {
          http.authVerificationsPerActor = previousPolicy;
          process.env.AUTH_EMAIL_ENABLED = previous.enabled;
          process.env.RESEND_FROM_EMAIL = previous.sender;
          process.env.RESEND_API_KEY = previous.key;
          emit.mockRestore();
        }
      });
    },
  });
}
