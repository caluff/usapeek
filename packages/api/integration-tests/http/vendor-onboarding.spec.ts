/**
 * Opt-in integration coverage; NEVER point this runner at shared infrastructure.
 * It creates/restores/drops its own random database and template database.
 * From packages/api, set all variables BEFORE starting pnpm (test-utils captures
 * DB credentials at import): VENDOR_ONBOARDING_TESTS=disposable-local,
 * NODE_ENV=test, DB_HOST=localhost, DB_USERNAME, DB_PASSWORD, DB_PORT,
 * REDIS_URL=rediss://user:password@localhost:port/15 (dedicated test instance),
 * JWT_SECRET and COOKIE_SECRET (different test-only values, >=32 characters).
 * Then: pnpm test:integration:http --runTestsByPath integration-tests/http/vendor-onboarding.spec.ts
 * No existing admin/customer credentials are needed. All emails use .invalid.
 * AUTH_EMAIL_ENABLED is disabled in this test process; auth verification rows
 * are test-only fixtures; native auth service request/confirm methods do not
 * emit the verification workflow's email event or call an email sender.
 * Native customer/admin/seller workflows create fixture actors. The runner owns
 * cleanup of the ENTIRE disposable database, including journals and remote links;
 * do not transplant these helpers into a script against an existing database.
 * Abrupt process death can leave ONLY the printed vapp_test_* database/template;
 * inspect those exact names before manually cleaning a disposable instance.
 */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createCustomerAccountWorkflow,
  createProductCategoriesWorkflow,
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createUsersWorkflow,
  updateStoresWorkflow,
} from "@medusajs/core-flows";
import { createSellerAccountWorkflow, approveSellerWorkflow } from "@mercurjs/core/workflows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import { MercurModules } from "@mercurjs/types";
import { onboardingService } from "../../src/lib/vendor-onboarding/access";
import type { ApplicationResponse, AdminApplicationResponse, DraftData } from "../../src/lib/vendor-onboarding/schemas";

const enabled = process.env.VENDOR_ONBOARDING_TESTS === "disposable-local";

if (!enabled) {
  describe.skip("Vendor onboarding integration (requires disposable-local opt-in)", () => {
    it("requires isolated PostgreSQL and Redis; see file header", () => {});
  });
} else {
  // Fail BEFORE registering runner hooks: cleanup itself has database side effects.
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
      !process.env.DB_USERNAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
    throw new Error("Set NODE_ENV=test and explicit localhost DB_HOST/DB_USERNAME/DB_PASSWORD/DB_PORT for a disposable PostgreSQL instance.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" ||
      !redis.username || !redis.password || !/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)) {
    throw new Error("REDIS_URL must explicitly select a nonzero DB on a dedicated localhost TLS Redis instance with credentials.");
  }
  if (process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error("Remove DB_TEMP_NAME/MEDUSA_DB_SCHEMA overrides; this suite owns random disposable names.");
  }
  const dbName = `vapp_test_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        if (new URL(config.projectConfig.databaseUrl!).pathname !== `/${dbName}`) {
          throw new Error("Refusing to run: app database does not match the disposable runner database.");
        }
        // Refuse real notification adapters even if a future subscriber ignores AUTH_EMAIL_ENABLED.
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) =>
            typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Use only local/mock notification providers in the disposable test configuration.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      type NativeSellerService = InstanceType<typeof SellerModule.service>;
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const native = () => getContainer().resolve<NativeSellerService>(MercurModules.SELLER);
      const journal = () => onboardingService(getContainer());
      const tracked = new Map<string, Set<string>>();
      const track = (kind: string, id: string) => {
        if (!tracked.has(kind)) tracked.set(kind, new Set());
        tracked.get(kind)!.add(id);
        return id;
      };
      let publishableKey: string;
      let categoryId: string;
      const headers = (token?: string, sellerId?: string) => ({
        "x-publishable-api-key": publishableKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(sellerId ? { "x-seller-id": sellerId } : {}),
      });
      const request = (method: "GET" | "POST" | "DELETE", url: string, token?: string, data?: unknown, sellerId?: string) =>
        api.request({ method, url, data, headers: headers(token, sellerId), validateStatus: () => true });
      async function login(actor: "customer" | "user" | "member", email: string, password: string) {
        const response = await request("POST", `/auth/${actor}/emailpass`, undefined, { email, password });
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token as string;
      }
      async function identity(verified = true) {
        const email = `vapp-${randomUUID()}@example.invalid`;
        const password = `Test-only-${randomUUID()}!`;
        const result = await auth().register("emailpass", { body: { email, password } });
        if (!result.success || !result.authIdentity) throw new Error("Disposable auth fixture registration failed");
        const id = track("auth_identity", result.authIdentity.id);
        if (verified) {
          // Deliberately local to this guarded test suite; never marks a real account verified.
          const verification = await auth().requestAuthVerification({
            auth_identity_id: id, entity_id: email, entity_type: "email", code_provider: "token",
          });
          if (!verification.code || !verification.id) throw new Error("Native verification fixture did not return a code and ID");
          track("auth_verification", verification.id);
          await auth().confirmAuthVerification({ code: verification.code, auth_identity_id: id });
        }
        return { id, email, password };
      }
      async function customer(verified = true) {
        const account = await identity(verified);
        const { result } = await createCustomerAccountWorkflow(getContainer()).run({ input: {
          authIdentityId: account.id,
          customerData: { email: account.email, first_name: "Disposable", last_name: "Applicant" },
        } });
        const customerId = track("customer", result.id);
        return { ...account, customerId, token: await login("customer", account.email, account.password) };
      }
      async function reviewer(canUpdate: boolean) {
        const account = await identity();
        const operations = canUpdate ? ["read", "update"] : ["read"];
        const rbac = getContainer().resolve(Modules.RBAC);
        const policies = (await Promise.all(operations.map(operation => rbac.listRbacPolicies({ resource: "seller", operation })))).flat();
        const missing = operations.filter(operation => !policies.some(policy => policy.operation === operation));
        if (missing.length) {
          const { result: created } = await createRbacPoliciesWorkflow(getContainer()).run({ input: {
            policies: missing.map(operation => ({ key: `seller:${operation}`, resource: "seller", operation })),
          } });
          created.forEach(policy => track("rbac_policy", policy.id));
          policies.push(...created);
        }
        const { result: roles } = await createRbacRolesWorkflow(getContainer()).run({ input: {
          roles: [{ name: `vapp-test-${randomUUID()}`, policy_ids: policies.map(policy => policy.id) }],
        } });
        const roleId = track("rbac_role", roles[0].id);
        const { result: users } = await createUsersWorkflow(getContainer()).run({ input: {
          users: [{ email: account.email, roles: [roleId] }],
        } });
        const userId = track("user", users[0].id);
        await auth().updateAuthIdentities({ id: account.id, app_metadata: { user_id: userId } });
        return { ...account, userId, token: await login("user", account.email, account.password) };
      }
      function draft(): DraftData {
        return {
          responsible: { first_name: "Disposable", last_name: "Applicant", phone: "+12025550123" },
          store: { name: `Test ${randomUUID()}`, handle: `test-${randomUUID()}`, description: "Disposable integration fixture store description.", website_url: "" },
          activity: { business_type: "individual", company_name: "", currency_code: "usd", category_ids: [categoryId], description: "Test fixtures only", business_address: { address_1: "1 Test Street", address_2: "", city: "Seattle", province: "WA", postal_code: "98101", country_code: "us" } },
        };
      }
      async function submitted(account: Awaited<ReturnType<typeof customer>>) {
        const saved = await request("POST", "/store/vendor-application", account.token, { mutation_id: randomUUID(), expected_version: 0, current_step: "review", data: draft() });
        expect(saved.status).toBe(201);
        track("vendor_application", saved.data.application.id);
        const response = await request("POST", "/store/vendor-application/submit", account.token, { mutation_id: randomUUID(), expected_version: saved.data.application.version, accepted_terms: true });
        expect(response.status).toBe(200);
        return (response.data as ApplicationResponse).application!;
      }
      async function nativeVendor() {
        const account = await identity();
        const { result: seller } = await createSellerAccountWorkflow(getContainer()).run({ input: {
          auth_identity_id: account.id, member_email: account.email,
          seller: { name: `Fixture ${randomUUID()}`, handle: `fixture-${randomUUID()}`, email: account.email, currency_code: "usd" },
        } });
        track("seller", seller.id);
        await approveSellerWorkflow(getContainer()).run({ input: { seller_id: seller.id } });
        const bound = await auth().retrieveAuthIdentity(account.id);
        const memberId = bound.app_metadata?.member_id;
        if (typeof memberId !== "string") throw new Error("Native member fixture was not bound");
        track("member", memberId);
        return { ...account, sellerId: seller.id, memberId, token: await login("member", account.email, account.password) };
      }
      async function approvedVendor(admin: Awaited<ReturnType<typeof reviewer>>) {
        const account = await customer();
        const application = await submitted(account);
        const approved = await request("POST", `/admin/vendor-applications/${application.id}/review`, admin.token, { mutation_id: randomUUID(), expected_version: application.version, decision: "approve" });
        expect(approved.status).toBe(200);
        const stored = await journal().retrieveVendorApplication(application.id);
        if (!stored.seller_id || !stored.member_id) throw new Error("Approved vendor fixture was not provisioned");
        const sellerId = track("seller", stored.seller_id);
        const memberId = track("member", stored.member_id);
        const token = await login("member", account.email, account.password);
        const warehouse = await request("GET", "/vendor/warehouse", token, undefined, sellerId);
        expect(warehouse.status).toBe(200);
        expect(warehouse.data.stock_location.id).toEqual(expect.any(String));
        const locationId = track("stock_location", warehouse.data.stock_location.id);
        return { ...account, sellerId, memberId, locationId, token };
      }
      beforeEach(async () => {
        tracked.clear();
        const { result: keys } = await createApiKeysWorkflow(getContainer()).run({ input: {
          api_keys: [{ title: "Disposable onboarding test", type: "publishable", created_by: "integration-test" }],
        } });
        track("api_key", keys[0].id);
        publishableKey = keys[0].token;
        const { result: categories } = await createProductCategoriesWorkflow(getContainer()).run({ input: {
          product_categories: [{ name: `Fixture ${randomUUID()}`, is_active: true, is_internal: false }],
        } });
        categoryId = track("product_category", categories[0].id);
        const { data: stores } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "store", fields: ["id"] });
        if (!stores[0]) throw new Error("Native store bootstrap fixture is missing");
        await updateStoresWorkflow(getContainer()).run({ input: {
          selector: { id: stores[0].id }, update: { supported_currencies: [{ currency_code: "usd", is_default: true }] },
        } });
      });

      it("requires a registered customer and denies buyer access to review/native vendor routes", async () => {
        const unregistered = await identity();
        const token = await login("customer", unregistered.email, unregistered.password);
        expect((await request("GET", "/store/vendor-application", token)).status).toBe(401);
        const buyer = await customer();
        expect((await request("GET", "/admin/vendor-applications", buyer.token)).status).toBe(401);
        expect([401, 403]).toContain((await request("POST", "/vendor/sellers", buyer.token, {})).status);
        expect([401, 403]).toContain((await request("GET", "/vendor/onboarding", buyer.token, undefined, "sel_forged")).status);
      });

      it("blocks unverified submission while preserving the saved draft", async () => {
        const buyer = await customer(false);
        const saved = await request("POST", "/store/vendor-application", buyer.token, { mutation_id: randomUUID(), expected_version: 0, current_step: "review", data: draft() });
        expect(saved.status).toBe(201);
        const response = await request("POST", "/store/vendor-application/submit", buyer.token, { mutation_id: randomUUID(), expected_version: 1, accepted_terms: true });
        expect(response.status).toBe(403);
        expect(response.data.code).toBe("verification_required");
        expect((await request("GET", "/store/vendor-application", buyer.token)).data.application.status).toBe("draft");
      });

      it("serializes concurrent first saves and rejects reuse of a mutation ID with different data", async () => {
        const buyer = await customer();
        const body = { mutation_id: randomUUID(), expected_version: 0, current_step: "store", data: draft() };
        const responses = await Promise.all([request("POST", "/store/vendor-application", buyer.token, body), request("POST", "/store/vendor-application", buyer.token, body)]);
        expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
        expect(await journal().listVendorApplications({ customer_id: buyer.customerId })).toHaveLength(1);
        expect(await journal().listVendorApplicationMutations({ customer_id: buyer.customerId, mutation_id: body.mutation_id })).toHaveLength(1);
        const conflict = await request("POST", "/store/vendor-application", buyer.token, { ...body, current_step: "activity" });
        expect(conflict.status).toBe(409);
      });

      it("enforces reviewer update permission and notification ownership", async () => {
        const buyer = await customer();
        const other = await customer();
        const application = await submitted(buyer);
        const reader = await reviewer(false);
        expect((await request("GET", `/admin/vendor-applications/${application.id}`, reader.token)).status).toBe(200);
        const denied = await request("POST", `/admin/vendor-applications/${application.id}/review`, reader.token, { mutation_id: randomUUID(), expected_version: application.version, decision: "approve" });
        expect(denied.status).toBe(403);
        const notifications = await request("GET", "/store/vendor-application/notifications", buyer.token);
        const id = track("vendor_application_event", notifications.data.notifications[0].id);
        expect((await request("POST", "/store/vendor-application/notifications/read", other.token, { notification_ids: [id] })).status).toBe(404);
        for (let repeat = 0; repeat < 2; repeat++) {
          expect((await request("POST", "/store/vendor-application/notifications/read", buyer.token, { notification_ids: [id] })).status).toBe(200);
        }
      });

      it("approves once under concurrency, replays approval, and preserves customer login and metadata", async () => {
        const buyer = await customer();
        const application = await submitted(buyer);
        const admin = await reviewer(true);
        const before = await auth().retrieveAuthIdentity(buyer.id);
        const body = { mutation_id: randomUUID(), expected_version: application.version, decision: "approve" };
        const url = `/admin/vendor-applications/${application.id}/review`;
        const responses = await Promise.all([request("POST", url, admin.token, body), request("POST", url, admin.token, { ...body, mutation_id: randomUUID() })]);
        expect(responses.filter(response => response.status === 200)).toHaveLength(1);
        expect(responses.filter(response => response.status === 409)).toHaveLength(1);
        const approved = (responses.find(response => response.status === 200)!.data as AdminApplicationResponse).application;
        const stored = await journal().retrieveVendorApplication(application.id);
        track("seller", stored.seller_id!);
        track("member", stored.member_id!);
        expect(approved.status).toBe("approved");
        expect(await native().listSellers({ external_id: `vendor-application:${application.id}` })).toHaveLength(1);
        expect(await native().listSellerMembers({ member_id: stored.member_id!, seller_id: stored.seller_id! })).toHaveLength(1);
        expect(await journal().listVendorApplicationEvents({ application_id: application.id, type: "approved" })).toHaveLength(1);
        const identityAfter = await auth().retrieveAuthIdentity(buyer.id);
        expect(identityAfter.app_metadata).toMatchObject({ ...before.app_metadata, customer_id: buyer.customerId, member_id: stored.member_id });
        const customerToken = await login("customer", buyer.email, buyer.password);
        expect((await request("GET", "/store/customers/me", customerToken)).data.customer.id).toBe(buyer.customerId);
        const memberToken = await login("member", buyer.email, buyer.password);
        expect((await request("GET", "/vendor/onboarding", memberToken, undefined, stored.seller_id!)).status).toBe(200);
        expect((await request("POST", "/vendor/sellers", memberToken, { name: "Bypass attempt" })).status).toBe(403);
        expect((await request("POST", `/admin/sellers/${stored.seller_id}/approve`, admin.token, {})).status).toBe(403);
        expect((await request("POST", `/admin/sellers/${stored.seller_id}`, admin.token, { status: "open" })).status).toBe(403);
        const successfulMutation = (await journal().listVendorApplicationMutations({ application_id: application.id, operation: "review", state: "complete" }))[0];
        expect((await request("POST", url, admin.token, { ...body, mutation_id: successfulMutation.mutation_id })).status).toBe(200);
      });

      it("compensates a failure after seller creation and identity binding, then permits a fresh approval", async () => {
        const buyer = await customer();
        const application = await submitted(buyer);
        const admin = await reviewer(true);
        const service = journal();
        const original = service.fenceApproval.bind(service);
        let injected = false;
        const fault = jest.spyOn(service, "fenceApproval").mockImplementation(async (...args) => {
          if (args[1].complete && !injected) { injected = true; throw new Error("TEST_ONLY_FINALIZE_FAILURE"); }
          return original(...args);
        });
        try {
          const failed = await request("POST", `/admin/vendor-applications/${application.id}/review`, admin.token, { mutation_id: randomUUID(), expected_version: application.version, decision: "approve" });
          expect(failed.status).toBeGreaterThanOrEqual(400);
        } finally { fault.mockRestore(); }
        expect(injected).toBe(true);
        expect((await auth().retrieveAuthIdentity(buyer.id)).app_metadata).toMatchObject({ customer_id: buyer.customerId });
        expect((await auth().retrieveAuthIdentity(buyer.id)).app_metadata?.member_id).toBeNull();
        expect(await native().listSellers({ external_id: `vendor-application:${application.id}` })).toHaveLength(0);
        const [failedMutation] = await service.listVendorApplicationMutations({ application_id: application.id, operation: "review", state: "failed" });
        expect(failedMutation?.member_id).toEqual(expect.any(String));
        expect(await native().listMembers({ id: failedMutation.member_id! })).toHaveLength(0);
        const customerToken = await login("customer", buyer.email, buyer.password);
        expect((await request("GET", "/store/customers/me", customerToken)).data.customer.id).toBe(buyer.customerId);
        const memberToken = await login("member", buyer.email, buyer.password);
        const memberClaims = JSON.parse(Buffer.from(memberToken.split(".")[1], "base64url").toString("utf8")) as { actor_id?: unknown };
        expect(memberClaims.actor_id).toBe("");
        expect((await request("GET", "/vendor/onboarding", memberToken)).status).toBe(401);
        const failedApp = await service.retrieveVendorApplication(application.id);
        expect(failedApp.status).toBe("submitted");
        expect(failedApp.approval_state).toBe("failed");
        const retry = await request("POST", `/admin/vendor-applications/${application.id}/review`, admin.token, { mutation_id: randomUUID(), expected_version: failedApp.version, decision: "approve" });
        expect(retry.status).toBe(200);
      });

      it("does not attach an existing same-email member from another identity or alter buyer credentials", async () => {
        const buyer = await customer();
        const application = await submitted(buyer);
        const admin = await reviewer(true);
        const unrelated = await identity();
        const { result: seller } = await createSellerAccountWorkflow(getContainer()).run({ input: {
          auth_identity_id: unrelated.id, member_email: buyer.email,
          seller: { name: `Collision ${randomUUID()}`, handle: `collision-${randomUUID()}`, email: unrelated.email, currency_code: "usd" },
        } });
        track("seller", seller.id);
        const originalIdentity = await auth().retrieveAuthIdentity(unrelated.id);
        const collisionMemberId = originalIdentity.app_metadata?.member_id;
        expect(typeof collisionMemberId).toBe("string");
        const response = await request("POST", `/admin/vendor-applications/${application.id}/review`, admin.token, { mutation_id: randomUUID(), expected_version: application.version, decision: "approve" });
        expect(response.status).toBe(409);
        expect(await native().listSellers({ external_id: `vendor-application:${application.id}` })).toHaveLength(0);
        expect((await auth().retrieveAuthIdentity(buyer.id)).app_metadata?.member_id).toBeUndefined();
        expect((await auth().retrieveAuthIdentity(unrelated.id)).app_metadata).toEqual(originalIdentity.app_metadata);
        expect(await native().listMembers({ id: collisionMemberId as string })).toHaveLength(1);
        const buyerToken = await login("customer", buyer.email, buyer.password);
        expect((await request("GET", "/store/customers/me", buyerToken)).data.customer.id).toBe(buyer.customerId);
      });

      it("reconciles a committed member binding whose response is lost without leaving a dangling actor", async () => {
        const buyer = await customer();
        const application = await submitted(buyer);
        const admin = await reviewer(true);
        const service = auth();
        const original = service.updateAuthIdentities.bind(service);
        let injected = false;
        const fault = jest.spyOn(service, "updateAuthIdentities").mockImplementation(async (...args) => {
          const result = await original(...args);
          const rows = Array.isArray(args[0]) ? args[0] : [args[0]];
          if (!injected && rows.some(row => row.id === buyer.id && typeof row.app_metadata?.member_id === "string")) {
            injected = true;
            throw new Error("TEST_ONLY_LOST_AUTH_WRITE_RESPONSE");
          }
          return result;
        });
        try {
          await request("POST", `/admin/vendor-applications/${application.id}/review`, admin.token, { mutation_id: randomUUID(), expected_version: application.version, decision: "approve" });
        } finally { fault.mockRestore(); }
        expect(injected).toBe(true);
        const after = await auth().retrieveAuthIdentity(buyer.id);
        expect(after.app_metadata?.customer_id).toBe(buyer.customerId);
        const memberId = after.app_metadata?.member_id;
        if (typeof memberId === "string") {
          // Recovery may successfully reconcile the committed write instead of rolling back.
          expect(await native().listMembers({ id: memberId })).toHaveLength(1);
          const current = await journal().retrieveVendorApplication(application.id);
          expect(current.status).toBe("approved");
          expect(current.member_id).toBe(memberId);
        } else {
          expect(await native().listSellers({ external_id: `vendor-application:${application.id}` })).toHaveLength(0);
        }
      });

      it("denies foreign private product reads, nested variants, previews, and edits", async () => {
        const owner = await nativeVendor();
        const other = await nativeVendor();
        const created = await request("POST", "/vendor/products", owner.token, { title: "Private fixture", status: "proposed", attributes: [], variants: [{ title: "One", sku: `fixture-${randomUUID()}`, options: {} }] }, owner.sellerId);
        expect(created.status).toBe(201);
        const productId = track("product", created.data.product.id);
        const variantId = track("variant", created.data.product.variants[0].id);
        expect((await request("GET", `/vendor/products/${productId}`, owner.token, undefined, owner.sellerId)).status).toBe(200);
        for (const suffix of ["", "/preview", "/variants", `/variants/${variantId}`]) {
          expect((await request("GET", `/vendor/products/${productId}${suffix}`, other.token, undefined, other.sellerId)).status).toBe(404);
        }
        expect((await request("POST", `/vendor/products/${productId}`, other.token, { title: "Unauthorized change" }, other.sellerId)).status).toBe(404);
        const forgedSeller = await request("GET", `/vendor/products/${productId}`, other.token, undefined, owner.sellerId);
        expect(forgedSeller.status).toBe(400);
        expect(forgedSeller.data).toMatchObject({ type: "not_allowed", message: "You are not a member of this seller account" });
        await native().updateMembers({ id: owner.memberId, is_active: false });
        expect((await request("GET", "/vendor/onboarding", owner.token, undefined, owner.sellerId)).status).toBe(403);
      });

      it("rejects foreign inventory locations on direct and batch writes without changing stock", async () => {
        const admin = await reviewer(true);
        const owner = await approvedVendor(admin);
        const other = await approvedVendor(admin);
        expect((await request("POST", "/vendor/stock-locations", owner.token, { name: "Unmanaged fixture location" }, owner.sellerId)).status).toBe(403);
        const locationId = owner.locationId;
        const foreignId = other.locationId;
        const item = await request("POST", "/vendor/inventory-items", owner.token, { sku: `fixture-${randomUUID()}` }, owner.sellerId);
        expect(item.status).toBe(200);
        const itemId = track("inventory_item", item.data.inventory_item.id);
        const base = `/vendor/inventory-items/${itemId}/location-levels`;
        expect((await request("POST", base, owner.token, { location_id: locationId, stocked_quantity: 7 }, owner.sellerId)).status).toBe(200);
        expect((await request("POST", base, owner.token, { location_id: foreignId, stocked_quantity: 9 }, owner.sellerId)).status).toBe(403);
        expect((await request("POST", `${base}/${foreignId}`, owner.token, { stocked_quantity: 9 }, owner.sellerId)).status).toBe(403);
        expect((await request("POST", `${base}/batch`, owner.token, { create: [{ location_id: foreignId, stocked_quantity: 9 }] }, owner.sellerId)).status).toBe(403);
        expect((await request("POST", `${base}/${locationId}`, other.token, { stocked_quantity: 9 }, other.sellerId)).status).toBe(403);
        const levels = await request("GET", base, owner.token, undefined, owner.sellerId);
        expect(levels.status).toBe(200);
        expect(levels.data.inventory_levels).toEqual([expect.objectContaining({ location_id: locationId, stocked_quantity: 7 })]);
      });
    },
  });
}
