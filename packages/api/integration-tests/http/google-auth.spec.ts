/**
 * Disposable PostgreSQL/TLS Redis only, following vendor-onboarding.spec.ts.
 * Set GOOGLE_AUTH_TESTS=disposable-local, NODE_ENV=test, DB_HOST=localhost,
 * DB_USERNAME, DB_PASSWORD, DB_PORT and a dedicated rediss://...@localhost:.../1.
 * The runner creates and drops a random database; never use shared infrastructure.
 * Google callbacks are represented by native Auth Module fixtures so this suite
 * never contacts Google or requires real OAuth credentials.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createCustomerAccountWorkflow, createRbacRolesWorkflow, createUserAccountWorkflow } from "@medusajs/core-flows";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { createSellerAccountWorkflow } from "@mercurjs/core/workflows";
import type SellerModule from "@mercurjs/core/modules/seller";
import { MercurModules } from "@mercurjs/types";

if (process.env.GOOGLE_AUTH_TESTS !== "disposable-local") {
  describe.skip("Google auth HTTP integration (requires disposable-local)", () => {
    it("requires isolated PostgreSQL and TLS Redis; see file header", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" || !process.env.DB_USERNAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
    throw new Error("Google auth tests require explicit disposable localhost PostgreSQL credentials and NODE_ENV=test.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || !redis.username || !redis.password || !/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)) {
    throw new Error("Google auth tests require a dedicated localhost TLS Redis instance with a nonzero database.");
  }
  if (process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) throw new Error("Remove DB_TEMP_NAME and MEDUSA_DB_SCHEMA; this suite owns its disposable database.");
  const dbName = `google_test_${randomUUID().replaceAll("-", "")}`;
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
        if (new URL(config.projectConfig.databaseUrl!).pathname !== `/${dbName}`) throw new Error("Application database does not match the disposable Google test database.");
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) => typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Use only local/mock notifications in the disposable Google test configuration.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      function token(identityId: string, provider = "google", actorId = "", actorType = "customer") {
        const { http } = getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig;
        return generateJwtToken({ actor_id: actorId, actor_type: actorType, auth_identity_id: identityId, auth_provider: provider, app_metadata: {} }, { secret: http.jwtSecret, expiresIn: "10m", jwtOptions: http.jwtOptions });
      }
      async function googleIdentity(email: string, provider = "google", profile: Record<string, unknown> = {}) {
        return auth().createAuthIdentities({ provider_identities: [{ provider, entity_id: randomUUID(), user_metadata: { ...profile, email } }] });
      }
      const headers = (value: string) => ({ authorization: `Bearer ${value}` });
      const nativeSeller = () => getContainer().resolve<InstanceType<typeof SellerModule.service>>(MercurModules.SELLER);
      const claims = (value: string) => JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
      // Use the TOTP utility of Medusa's installed Auth Module, without another dependency.
      const medusaRequire = createRequire(require.resolve("@medusajs/medusa/package.json"));
      const { generateTotpCode } = medusaRequire("@medusajs/auth/dist/utils/totp") as { generateTotpCode: (options: { secret: string }) => string };
      async function panelAccount(actorType: "user" | "member", email: string, names: { first_name?: string; last_name?: string } = {}) {
        const existing = await auth().createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email, user_metadata: { fixture: "original-password-provider" } }] });
        let actorId: string;
        let sellerId: string | undefined;
        if (actorType === "user") {
          const { result: roles } = await createRbacRolesWorkflow(getContainer()).run({ input: { roles: [{ name: `google-fixture-${randomUUID()}` }] } });
          const userData = { email, roles: [roles[0].id], ...names };
          const { result: user } = await createUserAccountWorkflow(getContainer()).run({ input: { authIdentityId: existing.id, userData } });
          actorId = user.id;
        } else {
          const { result: seller } = await createSellerAccountWorkflow(getContainer()).run({ input: {
            auth_identity_id: existing.id, member_email: email,
            ...names,
            seller: { name: `Google fixture ${randomUUID()}`, handle: `google-fixture-${randomUUID()}`, email, currency_code: "usd" },
          } });
          sellerId = seller.id;
          const bound = await auth().retrieveAuthIdentity(existing.id);
          const memberId = bound.app_metadata?.member_id;
          if (typeof memberId !== "string") throw new Error("Native member fixture was not bound");
          actorId = memberId;
        }
        const bound = await auth().retrieveAuthIdentity(existing.id);
        await auth().updateAuthIdentities({ id: existing.id, app_metadata: { ...bound.app_metadata, fixture_permissions: { unchanged: true } } });
        return { identityId: existing.id, actorId, sellerId, provider: actorType === "user" ? "google-admin" : "google" };
      }
      async function panelRoles(actorType: "user" | "member", actorId: string) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        if (actorType === "user") {
          const { data }: { data: unknown } = await query.graph({ entity: "user_rbac_role", fields: ["rbac_role_id"], filters: { user_id: actorId } }, { cache: { enable: false } });
          return z.array(z.object({ rbac_role_id: z.string().min(1) })).parse(data).map(link => ({ id: link.rbac_role_id }));
        }
        const members = await nativeSeller().listSellerMembers({ member_id: actorId });
        return members.map(member => ({ id: member.id, seller_id: member.seller_id, member_id: member.member_id, role_id: member.role_id, is_owner: member.is_owner }));
      }
      async function panelNames(actorType: "user" | "member", actorId: string) {
        const { data } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: actorType, fields: ["first_name", "last_name"], filters: { id: actorId } }, { cache: { enable: false } });
        return data[0];
      }

      it("requires authentication and rejects non-Google and cross-actor tokens", async () => {
        await expect(api.post("/auth/google/complete", { actor_type: "customer" })).rejects.toMatchObject({ response: { status: 401 } });
        const identity = await googleIdentity(`${randomUUID()}@example.invalid`);
        for (const value of [token(identity.id, "emailpass"), token(identity.id, "google", "", "user")]) {
          await expect(api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(value) })).rejects.toMatchObject({ response: { status: 401 } });
        }
      });

      it("preserves the existing customer identity while attaching Google and refreshes natively", async () => {
        const email = `${randomUUID()}@example.invalid`;
        const existing = await auth().createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({ input: { authIdentityId: existing.id, customerData: { email } } });
        const google = await googleIdentity(email);
        const partial = token(google.id);
        const first = await api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(partial) });
        expect(first.data).toEqual({ status: "link_required" });
        await expect(api.post("/auth/google/complete", { actor_type: "customer", existing_token: token(existing.id, "emailpass") }, { headers: headers(partial) })).rejects.toMatchObject({ response: { status: 401 } });
        const linked = await api.post("/auth/google/complete", { actor_type: "customer", existing_token: token(existing.id, "emailpass", customer.id) }, { headers: headers(partial) });
        expect(linked.data.status).toBe("complete");
        const canonical = await auth().retrieveAuthIdentity(existing.id, { relations: ["provider_identities"] });
        expect(canonical.app_metadata?.customer_id).toBe(customer.id);
        expect(canonical.provider_identities?.map(provider => provider.provider).sort()).toEqual(["emailpass", "google"]);
        const orphan = await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] });
        expect(orphan.provider_identities).toEqual([]);
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(linked.data.token) });
        expect(refreshed.data.token).toEqual(expect.any(String));
      });

      it("does not create operators or vendor members", async () => {
        for (const actorType of ["user", "member"]) {
          const provider = actorType === "user" ? "google-admin" : "google";
          const email = `unregistered-${randomUUID()}@gmail.com`;
          const identity = await googleIdentity(email, provider);
          await expect(api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(identity.id, provider, "", actorType)) })).rejects.toMatchObject({
            response: {
              status: 400,
              data: {
                type: "not_allowed",
                message: "No account has access to this panel. Sign in with an existing account.",
              },
            },
          });
          expect((await auth().retrieveAuthIdentity(identity.id)).app_metadata?.[`${actorType}_id`]).toBeUndefined();
          const { data } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: actorType, fields: ["id"], filters: { email } }, { cache: { enable: false } });
          expect(data).toEqual([]);
        }
      });

      it.each(["user", "member"] as const)("automatically links an existing Gmail %s while preserving its native identity and roles", async actorType => {
        const email = `panel-google-${randomUUID()}@gmail.com`;
        const account = await panelAccount(actorType, email);
        const before = await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] });
        const rolesBefore = await panelRoles(actorType, account.actorId);
        expect(rolesBefore).toHaveLength(1);
        const google = await googleIdentity(email, account.provider);
        const linked = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(google.id, account.provider, "", actorType)) });
        expect(linked.data.status).toBe("complete");
        expect(claims(linked.data.token)).toMatchObject({ actor_id: "", actor_type: actorType, auth_identity_id: account.identityId, app_metadata: {} });
        const canonical = await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] });
        expect(canonical.app_metadata).toEqual(before.app_metadata);
        expect(canonical.provider_identities?.find(provider => provider.provider === "emailpass")).toEqual(before.provider_identities?.find(provider => provider.provider === "emailpass"));
        expect(canonical.provider_identities?.map(provider => provider.provider).sort()).toEqual(["emailpass", account.provider].sort());
        expect((await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] })).provider_identities).toEqual([]);
        expect(await panelRoles(actorType, account.actorId)).toEqual(rolesBefore);
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(linked.data.token) });
        expect(claims(refreshed.data.token)).toMatchObject({ actor_id: account.actorId, actor_type: actorType, auth_identity_id: account.identityId });
        const retried = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(account.identityId, account.provider, "", actorType)) });
        expect(retried.data.status).toBe("complete");
        expect(claims(retried.data.token)).toMatchObject({ actor_id: "", auth_identity_id: account.identityId });
        expect((await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] })).provider_identities).toHaveLength(2);
      });

      it.each(["user", "member"] as const)("fills only missing %s names from Google without changing saved names or roles", async actorType => {
        for (const names of [{}, { first_name: "Saved first" }, { last_name: "Saved last" }, { first_name: "Saved first", last_name: "Saved last" }]) {
          const email = `profile-${randomUUID()}@gmail.com`;
          const account = await panelAccount(actorType, email, names);
          const before = await auth().retrieveAuthIdentity(account.identityId);
          const roles = await panelRoles(actorType, account.actorId);
          const google = await googleIdentity(email, account.provider, { given_name: " Google first ", family_name: " Google last " });
          const linked = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(google.id, account.provider, "", actorType)) });
          expect(linked.data.status).toBe("complete");
          expect(await panelNames(actorType, account.actorId)).toMatchObject({ first_name: "first_name" in names ? names.first_name : "Google first", last_name: "last_name" in names ? names.last_name : "Google last" });
          expect((await auth().retrieveAuthIdentity(account.identityId)).app_metadata).toEqual(before.app_metadata);
          expect(await panelRoles(actorType, account.actorId)).toEqual(roles);
        }
      });

      it.each(["user", "member"] as const)("enriches a manually linked external-email %s and treats a full name as a display name", async actorType => {
        const email = `profile-external-${randomUUID()}@example.invalid`;
        const account = await panelAccount(actorType, email);
        const google = await googleIdentity(email, account.provider, { name: "  María del Mar  " });
        const linked = await api.post("/auth/google/complete", { actor_type: actorType, existing_token: token(account.identityId, "emailpass", account.actorId, actorType) }, { headers: headers(token(google.id, account.provider, "", actorType)) });
        expect(linked.data.status).toBe("complete");
        expect(await panelNames(actorType, account.actorId)).toMatchObject({ first_name: "María del Mar", last_name: null });
        const retried = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(account.identityId, account.provider, "", actorType)) });
        expect(retried.data.status).toBe("complete");
        expect(await panelNames(actorType, account.actorId)).toMatchObject({ first_name: "María del Mar", last_name: null });
      });

      it.each(["user", "member"] as const)("fills missing names for an already-linked %s after full native MFA authentication", async actorType => {
        const email = `profile-mfa-${randomUUID()}@gmail.com`;
        const account = await panelAccount(actorType, email);
        await auth().createProviderIdentities({ provider: account.provider, entity_id: randomUUID(), auth_identity_id: account.identityId, user_metadata: { email, given_name: "MFA first", family_name: "MFA last" } });
        const setup = await auth().startAuthMfa({ auth_identity_id: account.identityId, provider: "totp", label: "Disposable profile fixture", issuer: "usapeek tests" });
        if (!setup.secret) throw new Error("Native TOTP fixture did not return its enrollment secret");
        const factor = await auth().verifyAuthMfa({ id: setup.mfa.id, code: generateTotpCode({ secret: setup.secret }) });
        const before = await auth().retrieveAuthMfa(factor.id);
        const partial = token(account.identityId, account.provider, "", actorType);
        await expect(api.post("/auth/account/profile/google", {}, { headers: headers(partial) })).rejects.toMatchObject({ response: { status: 401 } });
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(partial) });
        expect(refreshed.data.mfa_required).toBe(true);
        const verified = await api.post(`/auth/mfa/challenges/${refreshed.data.mfa_challenge.id}/verify`, { method: "totp", code: generateTotpCode({ secret: setup.secret }) }, { headers: headers(refreshed.data.token) });
        expect(claims(verified.data.token)).toMatchObject({ actor_id: account.actorId, auth_identity_id: account.identityId });
        const enriched = await api.post("/auth/account/profile/google", {}, { headers: headers(verified.data.token) });
        expect(enriched.data).toEqual({ updated: true });
        expect(await panelNames(actorType, account.actorId)).toMatchObject({ first_name: "MFA first", last_name: "MFA last" });
        expect(await auth().retrieveAuthMfa(factor.id)).toEqual(before);
        const repeated = await api.post("/auth/account/profile/google", {}, { headers: headers(verified.data.token) });
        expect(repeated.data).toEqual({ updated: false });
      });

      it.each(["user", "member"] as const)("leaves %s names missing when Google has no usable name and rejects unrelated actor bindings", async actorType => {
        const email = `profile-absent-${randomUUID()}@gmail.com`;
        const account = await panelAccount(actorType, email);
        await auth().createProviderIdentities({ provider: account.provider, entity_id: randomUUID(), auth_identity_id: account.identityId, user_metadata: { email, given_name: " ", family_name: null, name: 123 } });
        const completed = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(account.identityId, account.provider, "", actorType)) });
        expect(completed.data.status).toBe("complete");
        expect(await panelNames(actorType, account.actorId)).toMatchObject({ first_name: null, last_name: null });
        const unrelated = await panelAccount(actorType, `other-profile-${randomUUID()}@gmail.com`);
        await expect(api.post("/auth/account/profile/google", {}, { headers: headers(token(account.identityId, account.provider, unrelated.actorId, actorType)) })).rejects.toMatchObject({ response: { status: 401 } });
        expect(await panelNames(actorType, unrelated.actorId)).toMatchObject({ first_name: null, last_name: null });
      });

      it("requires a full panel session and does not enrich a password-only account", async () => {
        await expect(api.post("/auth/account/profile/google", {})).rejects.toMatchObject({ response: { status: 401 } });
        const account = await panelAccount("user", `password-profile-${randomUUID()}@gmail.com`);
        const response = await api.post("/auth/account/profile/google", {}, { headers: headers(token(account.identityId, "emailpass", account.actorId, "user")) });
        expect(response.data).toEqual({ updated: false });
        expect(await panelNames("user", account.actorId)).toMatchObject({ first_name: null, last_name: null });
      });

      it.each(["user", "member"] as const)("preserves enabled native MFA when automatically linking a Gmail %s", async actorType => {
        const email = `mfa-${randomUUID()}@gmail.com`;
        const account = await panelAccount(actorType, email);
        const setup = await auth().startAuthMfa({ auth_identity_id: account.identityId, provider: "totp", label: "Disposable Google fixture", issuer: "usapeek tests" });
        if (!setup.secret) throw new Error("Native TOTP fixture did not return its enrollment secret");
        const factor = await auth().verifyAuthMfa({ id: setup.mfa.id, code: generateTotpCode({ secret: setup.secret }) });
        expect(factor.status).toBe("enabled");
        const enrolledFactor = await auth().retrieveAuthMfa(factor.id);
        const google = await googleIdentity(email, account.provider);
        const linked = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(google.id, account.provider, "", actorType)) });
        expect(linked.data.status).toBe("complete");
        expect(claims(linked.data.token)).toMatchObject({ actor_id: "", auth_identity_id: account.identityId, app_metadata: {} });
        expect(await auth().retrieveAuthMfa(factor.id)).toEqual(enrolledFactor);
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(linked.data.token) });
        expect(refreshed.data).toMatchObject({ mfa_required: true, mfa_challenge: { methods: expect.arrayContaining(["totp"]) } });
        expect(claims(refreshed.data.token)).toMatchObject({ actor_id: "", actor_type: actorType, auth_identity_id: account.identityId });
      });

      it.each(["user", "member"] as const)("still requires explicit linking for an existing external-email %s", async actorType => {
        const email = `external-${randomUUID()}@example.invalid`;
        const account = await panelAccount(actorType, email);
        const google = await googleIdentity(email, account.provider);
        const response = await api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(google.id, account.provider, "", actorType)) });
        expect(response.data).toEqual({ status: "link_required" });
        expect((await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] })).provider_identities?.map(provider => provider.provider)).toEqual(["emailpass"]);
        expect((await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] })).provider_identities).toHaveLength(1);
      });

      it("rejects an inactive Gmail member before attaching Google", async () => {
        const email = `inactive-${randomUUID()}@gmail.com`;
        const account = await panelAccount("member", email);
        await nativeSeller().updateMembers({ id: account.actorId, is_active: false });
        const google = await googleIdentity(email);
        await expect(api.post("/auth/google/complete", { actor_type: "member" }, { headers: headers(token(google.id, "google", "", "member")) })).rejects.toMatchObject({ response: { status: 401 } });
        expect((await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] })).provider_identities?.map(provider => provider.provider)).toEqual(["emailpass"]);
        expect((await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] })).provider_identities).toHaveLength(1);
      });

      it.each(["user", "member"] as const)("rejects a second Google provider for an already linked Gmail %s", async actorType => {
        const email = `conflict-${randomUUID()}@gmail.com`;
        const account = await panelAccount(actorType, email);
        await auth().createProviderIdentities({ provider: account.provider, entity_id: randomUUID(), auth_identity_id: account.identityId, user_metadata: { email } });
        const before = await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] });
        const google = await googleIdentity(email, account.provider);
        await expect(api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(google.id, account.provider, "", actorType)) })).rejects.toMatchObject({ response: { status: 400, data: { type: "not_allowed", message: "This Google account is already associated with another account." } } });
        expect(await auth().retrieveAuthIdentity(account.identityId, { relations: ["provider_identities"] })).toEqual(before);
        expect((await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] })).provider_identities).toHaveLength(1);
      });

      it("does not grant administrator access to a same-email customer identity", async () => {
        const email = `customer-only-${randomUUID()}@gmail.com`;
        const existing = await auth().createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({ input: { authIdentityId: existing.id, customerData: { email } } });
        const google = await googleIdentity(email, "google-admin");
        await expect(api.post("/auth/google/complete", { actor_type: "user" }, { headers: headers(token(google.id, "google-admin", "", "user")) })).rejects.toMatchObject({ response: { status: 400, data: { type: "not_allowed", message: "No account has access to this panel. Sign in with an existing account." } } });
        const canonical = await auth().retrieveAuthIdentity(existing.id, { relations: ["provider_identities"] });
        expect(canonical.app_metadata).toMatchObject({ customer_id: customer.id });
        expect(canonical.app_metadata?.user_id).toBeUndefined();
        expect(canonical.provider_identities?.map(provider => provider.provider)).toEqual(["emailpass"]);
        expect((await auth().retrieveAuthIdentity(google.id)).app_metadata?.user_id).toBeUndefined();
      });

      it("automatically links an authoritative Gmail customer to its existing native identity", async () => {
        const email = `google-integration-${randomUUID()}@gmail.com`;
        const existing = await auth().createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({ input: { authIdentityId: existing.id, customerData: { email } } });
        const google = await googleIdentity(email);
        const linked = await api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(token(google.id)) });
        expect(linked.data.status).toBe("complete");
        const canonical = await auth().retrieveAuthIdentity(existing.id, { relations: ["provider_identities"] });
        expect(canonical.app_metadata?.customer_id).toBe(customer.id);
        expect(canonical.provider_identities?.map(provider => provider.provider).sort()).toEqual(["emailpass", "google"]);
        expect((await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] })).provider_identities).toEqual([]);
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(linked.data.token) });
        expect(refreshed.data.token).toEqual(expect.any(String));
      });
    },
  });
}
