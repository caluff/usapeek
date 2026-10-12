/**
 * GOOGLE_ONE_TAP_TESTS=disposable-local opts into real native authentication,
 * completion and MFA on the reserved TLS PostgreSQL/Redis and a random database.
 * Only Google's signing-key transport is local: RS256 verification remains the
 * installed provider's implementation. No Google requests or emails are sent.
 */
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { createRequire } from "node:module";
import { createApiKeysWorkflow, createCustomerAccountWorkflow } from "@medusajs/core-flows";
import type { ConfigModule, IAuthModuleService, ILockingModule, Logger } from "@medusajs/framework/types";
import type { AbstractAuthModuleProvider } from "@medusajs/framework/utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { CompleteGoogleAuthResponse } from "../../src/api/auth/google/complete/contracts";
import { GoogleOneTapTransactionResponseSchema, type GoogleOneTapTransactionResponse } from "../../src/lib/google-one-tap/contracts";
import { createGoogleOneTapTransaction } from "../../src/lib/google-one-tap/transaction";
import GoogleOneTapAuthService from "../../src/modules/google-one-tap/service";
import { assertLifecycleBootstrap, isolatedCheckoutLifecycleEnvironment } from "../helpers/checkout-lifecycle-fixture";

const LOCAL_CLIENT_ID = "isolated-one-tap.apps.googleusercontent.com";
const LOCAL_KEY_ID = "disposable-one-tap-key";

if (process.env.GOOGLE_ONE_TAP_TESTS !== "disposable-local") {
  describe.skip("Google One Tap (requires disposable-local opt-in)", () => {
    it("requires exclusive isolated PostgreSQL and TLS Redis", () => {});
  });
} else {
  const dbName = isolatedCheckoutLifecycleEnvironment();
  jest.setTimeout(180_000);
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const foreignKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: { beforeServerStart: async container => assertLifecycleBootstrap(container, dbName) },
    testSuite: ({ api, getContainer }) => {
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY);
      const config = () => getContainer().resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE);
      const authenticationSecret = () => {
        const secret = config().projectConfig.http.jwtSecret;
        if (typeof secret !== "string") throw new Error("Disposable One Tap requires an ephemeral string authentication secret");
        return secret;
      };
      let publishableKey: string;
      let providerSelection: jest.SpyInstance;
      const medusaRequire = createRequire(require.resolve("@medusajs/medusa/package.json"));
      const { generateTotpCode } = medusaRequire("@medusajs/auth/dist/utils/totp") as {
        generateTotpCode: (options: { secret: string }) => string;
      };

      beforeAll(() => {
        // Bootstrap already proved every external adapter disabled. Configure
        // only this local instance after startup, without changing root .env.
        process.env.GOOGLE_CLIENT_ID = LOCAL_CLIENT_ID;
        process.env.GOOGLE_CLIENT_SECRET = "isolated-unused-client-secret";
        process.env.GOOGLE_CALLBACK_URL = "http://localhost:3000/auth/google/callback";
        const provider = new GoogleOneTapAuthService({
          logger: getContainer().resolve<Logger>(ContainerRegistrationKeys.LOGGER),
          locking: getContainer().resolve<ILockingModule>(Modules.LOCKING),
        }, {
          clientId: LOCAL_CLIENT_ID,
          clientSecret: "isolated-unused-client-secret",
          callbackUrl: process.env.GOOGLE_CALLBACK_URL,
          oneTapSecret: authenticationSecret(),
        });
        // Installed GoogleAuthService stores this callback as an own property.
        // Replace key transport only; native verify_ still checks the signature,
        // algorithm, issuer, audience and expiration with jsonwebtoken.
        Object.defineProperty(provider, "getSigningKey_", {
          value: (header: { kid?: string }, callback: (error: Error | null, key?: string) => void) => {
            if (header.kid !== LOCAL_KEY_ID) return callback(new Error("Unknown local fixture signing key"));
            callback(null, publicKey);
          },
        });
        // Medusa's installed AuthModuleService uses this collaborator to select
        // providers. Authentication, persistence and MFA remain native.
        const nativeAuth = auth() as IAuthModuleService & {
          authProviderService_: { retrieveProviderRegistration(id: string): AbstractAuthModuleProvider };
        };
        const original = nativeAuth.authProviderService_.retrieveProviderRegistration.bind(nativeAuth.authProviderService_);
        providerSelection = jest.spyOn(nativeAuth.authProviderService_, "retrieveProviderRegistration")
          .mockImplementation(id => id === "google" ? provider : original(id));
      });

      beforeEach(async () => {
        const { result } = await createApiKeysWorkflow(getContainer()).run({ input: {
          api_keys: [{ type: "publishable", title: "Isolated One Tap", created_by: "one-tap-test" }],
        } });
        publishableKey = result[0].token;
      });

      afterAll(() => {
        providerSelection?.mockRestore();
        process.env.GOOGLE_CLIENT_ID = " ";
        process.env.GOOGLE_CLIENT_SECRET = " ";
        process.env.GOOGLE_CALLBACK_URL = " ";
      });

      const headers = (token: string) => ({ authorization: `Bearer ${token}`, "x-publishable-api-key": publishableKey });
      function tokenFromResponse(response: { data: unknown }) {
        const body = response.data;
        if (!body || typeof body !== "object" || !("token" in body) || typeof body.token !== "string") {
          throw new Error("Expected native authentication token");
        }
        return body.token;
      }
      const jwtClaims = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
      async function transaction(): Promise<GoogleOneTapTransactionResponse> {
        const response = await api.post("/auth/google/one-tap/transaction", {});
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toContain("no-store");
        return GoogleOneTapTransactionResponseSchema.parse(response.data);
      }
      function credential(proof: GoogleOneTapTransactionResponse, subject: string, email: string, payload: Record<string, unknown> = {}, header: Record<string, unknown> = {}, privateKey: KeyObject = keys.privateKey) {
        const now = Math.floor(Date.now() / 1000);
        const segments = [
          Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: LOCAL_KEY_ID, ...header })).toString("base64url"),
          Buffer.from(JSON.stringify({
            iss: "https://accounts.google.com", aud: LOCAL_CLIENT_ID,
            sub: subject, email, email_verified: true, iat: now, exp: now + 3600,
            nonce: proof.nonce, given_name: "One Tap", family_name: "Fixture", ...payload,
          })).toString("base64url"),
        ];
        const signed = segments.join(".");
        return `${signed}.${sign("RSA-SHA256", Buffer.from(signed), privateKey).toString("base64url")}`;
      }
      const login = (proof: GoogleOneTapTransactionResponse, idToken: string, extra: Record<string, unknown> = {}) =>
        api.post("/auth/customer/google", { id_token: idToken, transaction_token: proof.transaction_token, ...extra });
      async function noIdentity(subject: string, email: string) {
        expect(await auth().listAuthIdentities({ provider_identities: { provider: "google", entity_id: subject } })).toEqual([]);
        const { data } = await query().graph({ entity: "customer", fields: ["id"], filters: { email } }, { cache: { enable: false } });
        expect(data).toEqual([]);
      }
      async function complete(token: string): Promise<CompleteGoogleAuthResponse> {
        return (await api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(token) })).data;
      }
      async function account(email: string, provider: "emailpass" | "google", subject = randomUUID()) {
        const identity = await auth().createAuthIdentities({ provider_identities: [{
          provider, entity_id: provider === "emailpass" ? email : subject, user_metadata: { email },
        }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({
          input: { authIdentityId: identity.id, customerData: { email } },
        });
        return { identity, customer, subject };
      }

      it("issues unique short-lived private transactions and preserves ordinary OAuth redirects", async () => {
        const [first, second] = await Promise.all([transaction(), transaction()]);
        expect(first.client_id).toBe(LOCAL_CLIENT_ID);
        expect(first.nonce).not.toBe(second.nonce);
        expect(first.transaction_token).not.toBe(second.transaction_token);
        expect(first.transaction_token).not.toContain(first.nonce);
        await expect(api.post("/auth/google/one-tap/transaction", { nonce: first.nonce })).rejects.toMatchObject({ response: { status: 400 } });
        const redirect = await api.post("/auth/customer/google", {});
        expect(redirect.data.location).toEqual(expect.stringContaining("https://accounts.google.com/o/oauth2/v2/auth?"));
        expect(new URL(redirect.data.location).searchParams.get("client_id")).toBe(LOCAL_CLIENT_ID);
      });

      const invalidClaims: { label: string; payload?: Record<string, unknown>; header?: Record<string, unknown>; foreignSignature?: boolean }[] = [
        { label: "wrong issuer", payload: { iss: "https://issuer.example.invalid" } },
        { label: "wrong audience", payload: { aud: "another-client.apps.googleusercontent.com" } },
        { label: "expired ID token", payload: { exp: 1 } },
        { label: "missing expiration", payload: { exp: undefined } },
        { label: "future issuance", payload: { iat: Math.floor(Date.now() / 1000) + 3600 } },
        { label: "wrong nonce", payload: { nonce: Buffer.alloc(32, 7).toString("base64url") } },
        { label: "missing nonce", payload: { nonce: undefined } },
        { label: "unverified email", payload: { email_verified: false } },
        { label: "truthy string email verification", payload: { email_verified: "true" } },
        { label: "missing subject", payload: { sub: undefined } },
        { label: "unknown key", header: { kid: "unknown-key" } },
        { label: "missing key id", header: { kid: undefined } },
        { label: "wrong algorithm", header: { alg: "HS256" } },
        { label: "foreign RSA signature", foreignSignature: true },
      ];
      it.each(invalidClaims.map(({ label, ...input }) => [label, input] as const))("rejects %s before creating an identity or spending valid transaction", async (_label, input) => {
        const proof = await transaction();
        const subject = randomUUID();
        const email = `one-tap-invalid-${randomUUID()}@example.invalid`;
        const invalid = credential(proof, subject, email, input.payload, input.header, input.foreignSignature ? foreignKeys.privateKey : keys.privateKey);
        await expect(login(proof, invalid)).rejects.toMatchObject({ response: { status: 401 } });
        await noIdentity(subject, email);
        const valid = await login(proof, credential(proof, subject, email));
        expect(valid.status).toBe(200);
        expect(tokenFromResponse(valid)).toEqual(expect.any(String));
      });

      it("rejects expired, foreign-client, tampered and mismatched transactions", async () => {
        const secret = authenticationSecret();
        const current = await transaction();
        const other = await transaction();
        const ciphertext = current.transaction_token.split(".");
        ciphertext[2] = `${ciphertext[2][0] === "a" ? "b" : "a"}${ciphertext[2].slice(1)}`;
        const invalidTransactions = [
          createGoogleOneTapTransaction(LOCAL_CLIENT_ID, secret, Date.now() - 601_000),
          createGoogleOneTapTransaction("another-client.apps.googleusercontent.com", secret),
          { ...current, transaction_token: ciphertext.join(".") },
        ];
        for (const proof of invalidTransactions) {
          const subject = randomUUID();
          const email = `transaction-${randomUUID()}@example.invalid`;
          await expect(login(proof, credential(proof, subject, email))).rejects.toMatchObject({ response: { status: 401 } });
          await noIdentity(subject, email);
        }
        const subject = randomUUID();
        const email = `mismatched-${randomUUID()}@example.invalid`;
        await expect(login(current, credential(other, subject, email))).rejects.toMatchObject({ response: { status: 401 } });
        await noIdentity(subject, email);
      });

      it("rejects mixed input and cross-actor One Tap authentication without provisioning privileged actors", async () => {
        const proof = await transaction();
        const subject = randomUUID();
        const email = `scope-${randomUUID()}@example.invalid`;
        const idToken = credential(proof, subject, email);
        await expect(login(proof, idToken, { code: "oauth-code" })).rejects.toMatchObject({ response: { status: 401 } });
        for (const actor of ["user", "member"]) {
          await expect(api.post(`/auth/${actor}/google`, { id_token: idToken, transaction_token: proof.transaction_token })).rejects.toMatchObject({ response: { status: 401 } });
          const { data } = await query().graph({ entity: actor, fields: ["id"], filters: { email } }, { cache: { enable: false } });
          expect(data).toEqual([]);
        }
        await noIdentity(subject, email);
        expect((await login(proof, idToken)).status).toBe(200);
      });

      it("consumes valid proof once under concurrency without creating duplicate Google identities", async () => {
        const proof = await transaction();
        const subject = randomUUID();
        const email = `replay-${randomUUID()}@example.invalid`;
        const body = { id_token: credential(proof, subject, email), transaction_token: proof.transaction_token };
        const options = { validateStatus: () => true };
        const responses = await Promise.all([api.post("/auth/customer/google", body, options), api.post("/auth/customer/google", body, options)]);
        expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
        await expect(api.post("/auth/customer/google", body)).rejects.toMatchObject({ response: { status: 401 } });
        expect(await auth().listAuthIdentities({ provider_identities: { provider: "google", entity_id: subject } })).toHaveLength(1);
      });

      it("completes a new native customer and resolves it through native refresh", async () => {
        const proof = await transaction();
        const subject = randomUUID();
        const email = `new-one-tap-${randomUUID()}@example.invalid`;
        const authenticated = await login(proof, credential(proof, subject, email));
        const initialToken = tokenFromResponse(authenticated);
        expect(jwtClaims(initialToken)).toMatchObject({ actor_id: "", actor_type: "customer", auth_provider: "google" });
        await expect(api.get("/store/customers/me", { headers: headers(initialToken) })).rejects.toMatchObject({ response: { status: 401 } });
        const completed = await complete(initialToken);
        if (completed.status !== "complete") throw new Error("Expected completed new customer authentication");
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(completed.token) });
        const resolved = await api.get("/store/customers/me", { headers: headers(tokenFromResponse(refreshed)) });
        expect(resolved.data.customer).toMatchObject({ email, has_account: true, first_name: "One Tap", last_name: "Fixture" });
        const identities = await auth().listAuthIdentities({ provider_identities: { provider: "google", entity_id: subject } }, { relations: ["provider_identities"] });
        expect(identities).toHaveLength(1);
        expect(identities[0].app_metadata?.customer_id).toBe(resolved.data.customer.id);
        expect(identities[0].provider_identities).toHaveLength(1);
        const freshProof = await transaction();
        const repeated = await login(freshProof, credential(freshProof, subject, email));
        expect(jwtClaims(tokenFromResponse(repeated))).toMatchObject({ actor_id: resolved.data.customer.id, auth_identity_id: identities[0].id });
        const { data } = await query().graph({ entity: "customer", fields: ["id"], filters: { email } }, { cache: { enable: false } });
        expect(data).toHaveLength(1);
      });

      it("uses an existing canonical Google customer without changing provider or customer identity", async () => {
        const email = `existing-one-tap-${randomUUID()}@example.invalid`;
        const existing = await account(email, "google");
        const original = await auth().retrieveAuthIdentity(existing.identity.id, { relations: ["provider_identities"] });
        const proof = await transaction();
        const authenticated = await login(proof, credential(proof, existing.subject, email));
        expect(jwtClaims(tokenFromResponse(authenticated))).toMatchObject({ actor_id: existing.customer.id, auth_identity_id: existing.identity.id, auth_provider: "google" });
        const completed = await complete(tokenFromResponse(authenticated));
        if (completed.status !== "complete") throw new Error("Expected completed existing Google authentication");
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(completed.token) });
        expect(jwtClaims(tokenFromResponse(refreshed))).toMatchObject({ actor_id: existing.customer.id, auth_identity_id: existing.identity.id });
        expect(await auth().retrieveAuthIdentity(existing.identity.id, { relations: ["provider_identities"] })).toEqual(original);
      });

      it("links verified Gmail to its original customer identity and preserves native TOTP enforcement", async () => {
        const email = `gmail-one-tap-${randomUUID()}@gmail.com`;
        const existing = await account(email, "emailpass");
        const original = await auth().retrieveAuthIdentity(existing.identity.id, { relations: ["provider_identities"] });
        const setup = await auth().startAuthMfa({ auth_identity_id: existing.identity.id, provider: "totp", label: "Disposable One Tap", issuer: "usapeek tests" });
        if (!setup.secret) throw new Error("Native TOTP setup requires a secret");
        const factor = await auth().verifyAuthMfa({ id: setup.mfa.id, code: generateTotpCode({ secret: setup.secret }) });
        const enrolled = await auth().retrieveAuthMfa(factor.id);
        const proof = await transaction();
        const authenticated = await login(proof, credential(proof, randomUUID(), email));
        const completed = await complete(tokenFromResponse(authenticated));
        if (completed.status !== "complete") throw new Error("Expected Gmail account linking");
        expect(jwtClaims(completed.token)).toMatchObject({ actor_id: "", auth_identity_id: existing.identity.id, app_metadata: {} });
        const canonical = await auth().retrieveAuthIdentity(existing.identity.id, { relations: ["provider_identities"] });
        expect(canonical.app_metadata).toEqual(original.app_metadata);
        expect(canonical.provider_identities?.find(provider => provider.provider === "emailpass")).toEqual(original.provider_identities?.[0]);
        expect(canonical.provider_identities?.map(provider => provider.provider).sort()).toEqual(["emailpass", "google"]);
        expect(await auth().retrieveAuthMfa(factor.id)).toEqual(enrolled);
        const pending = await api.post("/auth/token/refresh", {}, { headers: headers(completed.token) });
        expect(pending.data).toMatchObject({ mfa_required: true, mfa_challenge: { methods: expect.arrayContaining(["totp"]) } });
        const pendingToken = tokenFromResponse(pending);
        expect(jwtClaims(pendingToken)).toMatchObject({ actor_id: "", auth_identity_id: existing.identity.id });
        await expect(api.get("/store/customers/me", { headers: headers(pendingToken) })).rejects.toMatchObject({ response: { status: 401 } });
        const verified = await api.post(`/auth/mfa/challenges/${pending.data.mfa_challenge.id}/verify`, {
          method: "totp", code: generateTotpCode({ secret: setup.secret }),
        }, { headers: headers(pendingToken) });
        expect(jwtClaims(tokenFromResponse(verified))).toMatchObject({ actor_id: existing.customer.id, auth_identity_id: existing.identity.id });
        const self = await api.get("/store/customers/me", { headers: headers(tokenFromResponse(verified)) });
        expect(self.data.customer.id).toBe(existing.customer.id);
        expect(await auth().retrieveAuthMfa(factor.id)).toEqual(enrolled);
      });

      it("requires current account proof before linking a same-email external Google account", async () => {
        const email = `external-one-tap-${randomUUID()}@example.invalid`;
        const existing = await account(email, "emailpass");
        const original = await auth().retrieveAuthIdentity(existing.identity.id, { relations: ["provider_identities"] });
        const proof = await transaction();
        const subject = randomUUID();
        const authenticated = await login(proof, credential(proof, subject, email));
        expect(await complete(tokenFromResponse(authenticated))).toEqual({ status: "link_required" });
        expect(await auth().retrieveAuthIdentity(existing.identity.id, { relations: ["provider_identities"] })).toEqual(original);
        const { data } = await query().graph({ entity: "customer", fields: ["id"], filters: { email } }, { cache: { enable: false } });
        expect(data).toEqual([{ id: existing.customer.id }]);
        expect(jwtClaims(tokenFromResponse(authenticated)).actor_id).toBe("");
      });
    },
  });
}
