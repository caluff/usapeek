/**
 * HTTP integration against the real Medusa/Mercur app. Opt in only after the
 * coordinator reserves the disposable PostgreSQL/TLS Redis instance:
 * CART_OWNERSHIP_TESTS=disposable-local, then from packages/api:
 * pnpm test:integration:http --runTestsByPath integration-tests/http/cart-ownership.spec.ts
 * Import-ClosureTestEnvironment.ps1 must run in the same process beforehand.
 * The runner creates/restores/drops only its random cart_owner_test_* database
 * and template. Never run concurrently with another suite using Redis DB 15.
 * All actors use .invalid emails. External providers are disabled. Receipt
 * fixtures use native order creation and order_cart links; they do not claim
 * successful Mercur completion, inventory coverage, or an executed payment.
 * Carts deliberately isolate ownership; a custom line item exercises retention
 * and deletion without claiming a purchased offer's inventory/pricing lifecycle.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createCustomerAccountWorkflow,
  createCustomerGroupsWorkflow,
  createLineItemsStep,
  createOrderWorkflow,
  createRegionsWorkflow,
  createRemoteLinkStep,
  createSalesChannelsWorkflow,
  linkCustomersToCustomerGroupWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateCartsStep,
  updateStoresWorkflow,
} from "@medusajs/core-flows";
import type { CartDTO, HttpTypes, IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createOrderGroupStep } from "@mercurjs/core/workflows";
import { MercurModules } from "@mercurjs/types";

const enabled = process.env.CART_OWNERSHIP_TESTS === "disposable-local";

if (!enabled) {
  describe.skip("Cart ownership HTTP integration (requires disposable-local opt-in)", () => {
    it("requires the coordinator's isolated infrastructure reservation", () => {});
  });
} else {
  // Runner hooks themselves restore/drop databases; validate before registering them.
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
      process.env.DB_PORT !== "55432" || process.env.DB_USERNAME !== "closure_test" ||
      !process.env.DB_PASSWORD || process.env.PGSSLMODE !== "require" ||
      !process.env.NODE_EXTRA_CA_CERTS || !existsSync(process.env.NODE_EXTRA_CA_CERTS) ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("Import the verified disposable PostgreSQL/TLS environment before enabling cart ownership integration tests.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" ||
      redis.port !== "56379" || redis.pathname !== "/15" ||
      redis.username !== "closure" || !redis.password) {
    throw new Error("Cart ownership tests require the dedicated localhost TLS Redis on port 56379, DB 15.");
  }
  if (process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error("Remove DB_TEMP_NAME/MEDUSA_DB_SCHEMA; this suite owns random disposable database names.");
  }
  if ((process.env.JWT_SECRET?.trim().length ?? 0) < 32 ||
      (process.env.COOKIE_SECRET?.trim().length ?? 0) < 32 ||
      process.env.JWT_SECRET === process.env.COOKIE_SECRET) {
    throw new Error("Import distinct ephemeral JWT and cookie secrets before running this suite.");
  }
  for (const name of [
    "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PAYOUT_WEBHOOK_SECRET",
    "ALGOLIA_APP_ID", "ALGOLIA_API_KEY", "ALGOLIA_PRODUCT_INDEX",
    "SUPABASE_S3_ENDPOINT", "SUPABASE_S3_REGION", "SUPABASE_S3_ACCESS_KEY_ID",
    "SUPABASE_S3_SECRET_ACCESS_KEY", "SUPABASE_STORAGE_BUCKET",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL",
    "RESEND_API_KEY", "RESEND_FROM_EMAIL", "AUTH_EMAIL_FROM",
  ]) {
    if (process.env[name]?.trim()) {
      throw new Error("External provider configuration must be disabled by the disposable environment importer.");
    }
    // Prevent root dotenv from restoring any external provider configuration.
    process.env[name] = " ";
  }
  const dbName = `cart_owner_test_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);

  // Native steps only, scoped to the disposable receipt fixtures in this suite.
  const updateFixtureCart = createWorkflow(
    "cart-ownership-test-update-cart",
    function (input: Pick<CartDTO, "id" | "completed_at">) {
      return new WorkflowResponse(updateCartsStep([input]));
    },
  );
  const linkFixtureOrder = createWorkflow(
    "cart-ownership-test-link-order",
    function (input: { cart_id: string; order_id: string }) {
      const links = transform(input, (data) => [{
        [Modules.ORDER]: { order_id: data.order_id },
        [Modules.CART]: { cart_id: data.cart_id },
      }]);
      return new WorkflowResponse(createRemoteLinkStep(links));
    },
  );
  const addFixtureLineItem = createWorkflow(
    "cart-ownership-test-add-line-item",
    function (input: { id: string }) {
      const items = transform(input, ({ id }) => ({
        id,
        items: [{ cart_id: id, title: "Ownership fixture", quantity: 2, unit_price: 0, is_custom_price: true, requires_shipping: false }],
      }));
      return new WorkflowResponse(createLineItemsStep(items));
    },
  );
  const createFixtureOrderGroup = createWorkflow(
    "cart-ownership-test-order-group",
    function (input: { cart_id: string; customer_id: string; order_id: string }) {
      const group = createOrderGroupStep({ cart_id: input.cart_id, customer_id: input.customer_id });
      const links = transform({ group, input }, ({ group, input }) => [{
        [MercurModules.SELLER]: { order_group_id: group.id },
        [Modules.ORDER]: { order_id: input.order_id },
      }]);
      createRemoteLinkStep(links);
      return new WorkflowResponse(group);
    },
  );

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        const database = new URL(config.projectConfig.databaseUrl!);
        if (database.hostname !== "localhost" || database.port !== "55432" ||
            database.pathname !== `/${dbName}` ||
            config.projectConfig.redisUrl !== process.env.REDIS_URL) {
          throw new Error("The loaded app must use the suite's disposable PostgreSQL database and dedicated Redis.");
        }
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) =>
            typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Only local/mock notification adapters are allowed in cart ownership tests.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY);
      let publishableKey: string;
      let regionId: string;
      let salesChannelId: string;

      async function request<T = { code?: string; message?: string }>(
        method: "GET" | "POST" | "DELETE",
        url: string,
        token?: string,
        data?: unknown,
        cartId?: string,
      ): Promise<{ status: number; data: T }> {
        const response = await api.request({
          method, url, data,
          headers: {
            "x-publishable-api-key": publishableKey,
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(cartId ? { "x-marketplace-cart-id": cartId } : {}),
          },
          validateStatus: () => true,
        });
        return { status: response.status, data: response.data as T };
      }

      async function customer() {
        const email = `cart-owner-${randomUUID()}@example.invalid`;
        const password = `Test-only-${randomUUID()}!`;
        const registered = await auth().register("emailpass", { body: { email, password } });
        if (!registered.success || !registered.authIdentity) {
          throw new Error("Native disposable customer identity fixture failed.");
        }
        const identityId = registered.authIdentity.id;
        // Native service fixtures do not emit the verification workflow email event.
        const verification = await auth().requestAuthVerification({
          auth_identity_id: identityId, entity_id: email,
          entity_type: "email", code_provider: "token",
        });
        if (!verification.code) throw new Error("Native fixture verification code is missing.");
        await auth().confirmAuthVerification({ code: verification.code, auth_identity_id: identityId });
        const { result } = await createCustomerAccountWorkflow(getContainer()).run({ input: {
          authIdentityId: identityId,
          customerData: { email, first_name: "Private", last_name: "Account" },
        } });
        const login = await request<{ token?: string }>("POST", "/auth/customer/emailpass", undefined, { email, password });
        expect(login.status).toBe(200);
        if (!login.data.token) throw new Error("Native customer login fixture returned no token.");
        return { email, customerId: result.id, token: login.data.token };
      }

      function address() {
        return {
          first_name: "Guest", last_name: "Shopper", address_1: "1 Disposable Street",
          city: "Seattle", province: "wa", postal_code: "98101", country_code: "us",
        };
      }

      async function createCart(token?: string, email = `guest-${randomUUID()}@example.invalid`) {
        const response = await request<HttpTypes.StoreCartResponse>("POST", "/store/carts", token, {
          region_id: regionId, sales_channel_id: salesChannelId, email,
          shipping_address: address(), billing_address: address(),
          metadata: { fixture: randomUUID(), checkout_note: "Preserve this guest cart" },
        });
        expect(response.status).toBe(200);
        expect(response.data.cart.id).toEqual(expect.any(String));
        return response.data.cart;
      }

      async function retrieveCart(id: string, token?: string) {
        const response = await request<HttpTypes.StoreCartResponse>("GET", `/store/carts/${id}`, token);
        expect(response.status).toBe(200);
        return response.data.cart;
      }

      async function paymentCollection(cartId: string, token?: string) {
        const response = await request<HttpTypes.StorePaymentCollectionResponse>("POST", "/store/payment-collections", token, { cart_id: cartId });
        expect(response.status).toBe(200);
        expect(response.data.payment_collection.id).toEqual(expect.any(String));
        return response.data.payment_collection.id;
      }

      async function receiptFixture(cart: HttpTypes.StoreCart, completed = true) {
        const { result: order } = await createOrderWorkflow(getContainer()).run({ input: {
          region_id: regionId, sales_channel_id: salesChannelId,
          currency_code: "usd", customer_id: cart.customer_id,
          email: cart.email, items: [],
          shipping_address: address(), billing_address: address(),
          metadata: { fixture: "cart-ownership-http" },
        } });
        await linkFixtureOrder(getContainer()).run({ input: { cart_id: cart.id, order_id: order.id } });
        if (completed) {
          await updateFixtureCart(getContainer()).run({ input: {
            id: cart.id, completed_at: "2026-09-19T00:00:00.000Z",
          } });
        }
        return order;
      }

      beforeEach(async () => {
        const container = getContainer();
        const { result: keys } = await createApiKeysWorkflow(container).run({ input: {
          api_keys: [{ title: "Disposable cart ownership", type: "publishable", created_by: "integration-test" }],
        } });
        publishableKey = keys[0].token;
        const { result: channels } = await createSalesChannelsWorkflow(container).run({ input: {
          salesChannelsData: [{ name: `Cart ownership ${randomUUID()}` }],
        } });
        salesChannelId = channels[0].id;
        await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: keys[0].id, add: [salesChannelId] } });
        const { data: stores } = await query().graph({ entity: "store", fields: ["id"] });
        if (!stores[0]) throw new Error("Native store bootstrap fixture is missing.");
        await updateStoresWorkflow(container).run({ input: {
          selector: { id: stores[0].id },
          update: { supported_currencies: [{ currency_code: "usd", is_default: true }] },
        } });
        const { result: regions } = await createRegionsWorkflow(container).run({ input: {
          regions: [{ name: "Disposable US", currency_code: "usd", countries: ["us"], automatic_taxes: false }],
        } });
        regionId = regions[0].id;
      });

      it("keeps A's cart private after logout and when B logs in, across native read/write/checkout routes", async () => {
        const owner = await customer();
        const other = await customer();
        const cart = await createCart(owner.token, owner.email);
        expect(cart.customer_id).toBe(owner.customerId);
        const collectionId = await paymentCollection(cart.id, owner.token);
        for (const token of [undefined, other.token]) {
          const attempts: ["GET" | "POST" | "DELETE", string, unknown?][] = [
            ["GET", `/store/carts/${cart.id}`],
            ["POST", `/store/carts/${cart.id}`, { metadata: { unauthorized: true } }],
            ["DELETE", `/store/carts/${cart.id}/line-items/cali_foreign`],
            ["POST", `/store/carts/${cart.id}/complete`, {}],
            ["GET", `/store/shipping-options?cart_id=${cart.id}`],
            ["POST", "/store/payment-collections", { cart_id: cart.id }],
            ["POST", `/store/payment-collections/${collectionId}/payment-sessions`, { provider_id: "pp_system_default" }],
          ];
          for (const [method, path, body] of attempts) {
            const response = await request(method, path, token, body);
            expect({ path, status: response.status }).toEqual({ path, status: 404 });
            expect(response.data.message).toBe("Resource not found.");
          }
        }
        const transfer = await request("POST", `/store/carts/${cart.id}/customer`, other.token, {});
        expect(transfer.status).toBe(404);
        const unchanged = await retrieveCart(cart.id, owner.token);
        expect(unchanged.customer_id).toBe(owner.customerId);
        expect(unchanged.metadata).toEqual(cart.metadata);
        expect(unchanged.completed_at).toBeNull();
      });

      it("transfers a legitimate guest cart to B without replacing its addresses or metadata", async () => {
        const buyer = await customer();
        const cart = await createCart();
        const transferred = await request<HttpTypes.StoreCartResponse>("POST", `/store/carts/${cart.id}/customer`, buyer.token, {});
        expect(transferred.status).toBe(200);
        expect(transferred.data.cart.id).toBe(cart.id);
        expect(transferred.data.cart.customer_id).toBe(buyer.customerId);
        const after = await retrieveCart(cart.id, buyer.token);
        expect(after.metadata).toEqual(cart.metadata);
        expect(after.shipping_address).toEqual(cart.shipping_address);
        expect(after.billing_address).toEqual(cart.billing_address);
        expect(after.items).toEqual(cart.items);
        expect((await request("GET", `/store/carts/${cart.id}`)).status).toBe(404);
        expect(await paymentCollection(cart.id, buyer.token)).toEqual(expect.any(String));
      });

      it("retains native body validation on wrapped cart create, update, and customer transfer routes", async () => {
        const buyer = await customer();
        const cart = await createCart();
        const invalidCreate = await request("POST", "/store/carts", undefined, {
          region_id: regionId, sales_channel_id: salesChannelId, email: "invalid-email",
        });
        expect(invalidCreate.status).toBe(400);
        for (const body of [
          { email: "invalid-email" },
          { shipping_address: { country_code: 42 } },
          { customer_id: buyer.customerId },
        ]) {
          expect((await request("POST", `/store/carts/${cart.id}`, undefined, body)).status).toBe(400);
        }
        expect((await request("POST", `/store/carts/${cart.id}/customer`, buyer.token, { customer_id: buyer.customerId })).status).toBe(400);
        const unchanged = await retrieveCart(cart.id);
        expect(unchanged.customer_id).toBe(cart.customer_id);
        expect(unchanged.email).toBe(cart.email);
        expect(unchanged.shipping_address).toEqual(cart.shipping_address);
        expect(unchanged.metadata).toEqual(cart.metadata);
      });

      it("compensates a guest association after native update failure and allows a valid retry", async () => {
        const created = await request<HttpTypes.StoreCartResponse>("POST", "/store/carts", undefined, {
          region_id: regionId, sales_channel_id: salesChannelId,
          shipping_address: address(), metadata: { preserve: true },
        });
        expect(created.status).toBe(200);
        const cart = created.data.cart;
        expect(cart.customer_id).toBeNull();
        const { result: channels } = await createSalesChannelsWorkflow(getContainer()).run({ input: {
          salesChannelsData: [{ name: "Disabled compensation fixture", is_disabled: true }],
        } });
        const email = `compensation-${randomUUID()}@example.invalid`;
        const failed = await request("POST", `/store/carts/${cart.id}`, undefined, {
          email, sales_channel_id: channels[0].id,
        });
        expect(failed.status).toBe(400);
        expect(failed.data.message).toMatch(/disabled Sales Channel/);
        const restored = await retrieveCart(cart.id);
        expect(restored.customer_id).toBeNull();
        expect(restored.email).toBe(cart.email);
        expect(restored.metadata).toEqual(cart.metadata);
        expect(restored.shipping_address).toEqual(cart.shipping_address);
        const { data: guests } = await query().graph({
          entity: "customer", fields: ["id"], filters: { email, has_account: false },
        });
        expect(guests).toHaveLength(0);
        const retried = await request<HttpTypes.StoreCartResponse>("POST", `/store/carts/${cart.id}`, undefined, { email });
        expect(retried.status).toBe(200);
        expect(retried.data.cart.customer_id).toEqual(expect.any(String));
        expect(retried.data.cart.email).toBe(email);
      });

      for (const action of ["update", "complete", "delete-line-item", "payment-session", "transfer"] as const) {
        it(`rechecks ${action} ownership after a real transfer wins between the HTTP preflight and workflow lock`, async () => {
          const owner = await customer();
          const cart = await createCart();
          const challenger = action === "transfer" ? await customer() : undefined;
          const collectionId = action === "payment-session" ? await paymentCollection(cart.id) : undefined;
          const lineItem = action === "delete-line-item"
            ? (await addFixtureLineItem(getContainer()).run({ input: { id: cart.id } })).result[0]
            : undefined;
          const queryService = query();
          const originalGraph = queryService.graph.bind(queryService);
          let observePreflight!: () => void;
          let resumePreflight!: () => void;
          const preflightObserved = new Promise<void>((resolve) => { observePreflight = resolve; });
          const preflightResumed = new Promise<void>((resolve) => { resumePreflight = resolve; });
          let paused = false;
          // A timing barrier only: every query, mutation and HTTP handler stays real.
          const barrier = jest.spyOn(queryService, "graph").mockImplementation(async (...args) => {
            const result = await originalGraph(...args);
            const input = args[0];
            if (!paused && input.entity === "cart" && input.filters?.id === cart.id &&
                input.fields.includes("customer.has_account")) {
              paused = true;
              observePreflight();
              await preflightResumed;
            }
            return result;
          });
          const path = action === "payment-session"
            ? `/store/payment-collections/${collectionId}/payment-sessions`
            : `/store/carts/${cart.id}${action === "complete" ? "/complete" : action === "transfer" ? "/customer" : action === "delete-line-item" ? `/line-items/${lineItem!.id}` : ""}`;
          const pending = request(action === "delete-line-item" ? "DELETE" : "POST", path, challenger?.token,
            action === "update" ? { metadata: { unauthorized: true } }
              : action === "payment-session" ? { provider_id: "pp_system_default" } : {});
          try {
            await Promise.race([
              preflightObserved,
              pending.then(() => { throw new Error("The HTTP preflight did not reach the ownership timing barrier."); }),
            ]);
            const winner = await request<HttpTypes.StoreCartResponse>("POST", `/store/carts/${cart.id}/customer`, owner.token, {});
            expect(winner.status).toBe(200);
            expect(winner.data.cart.customer_id).toBe(owner.customerId);
            resumePreflight();
            const staleRequest = await pending;
            expect(staleRequest.status).toBe(404);
            expect(staleRequest.data.message).toBe("Resource not found.");
          } finally {
            resumePreflight();
            await pending;
            barrier.mockRestore();
          }
          const after = await retrieveCart(cart.id, owner.token);
          expect(after.customer_id).toBe(owner.customerId);
          expect(after.metadata).toEqual(cart.metadata);
          expect(after.completed_at).toBeNull();
          if (lineItem) expect(after.items).toEqual([expect.objectContaining({ id: lineItem.id, quantity: 2 })]);
          if (collectionId) {
            const { data: collections } = await query().graph({
              entity: "payment_collection", fields: ["id", "payment_sessions.id"], filters: { id: collectionId },
            });
            expect(collections[0].payment_sessions).toEqual([]);
          }
        });
      }

      it("requires native transfer before an authenticated buyer pays or completes a guest cart", async () => {
        const buyer = await customer();
        const cart = await createCart();
        for (const [path, body] of [
          ["/store/payment-collections", { cart_id: cart.id }],
          [`/store/carts/${cart.id}/complete`, {}],
          [`/store/carts/${cart.id}`, { email: buyer.email }],
        ] as const) {
          const response = await request("POST", path, buyer.token, body);
          expect(response.status).toBe(403);
          expect(response.data.code).toBe("cart_customer_transfer_required");
        }
        const { data: links } = await query().graph({
          entity: "cart_payment_collection", fields: ["cart_id"], filters: { cart_id: cart.id },
        });
        expect(links).toHaveLength(0);
        const unchanged = await retrieveCart(cart.id);
        expect(unchanged.customer_id).toBe(cart.customer_id);
        expect(unchanged.email).toBe(cart.email);
        expect(unchanged.metadata).toEqual(cart.metadata);
        expect(unchanged.completed_at).toBeNull();
        // A legitimate guest still reaches the native collection creation route.
        const collectionId = await paymentCollection(cart.id);
        const session = await request("POST", `/store/payment-collections/${collectionId}/payment-sessions`, buyer.token, { provider_id: "pp_system_default" });
        expect(session.status).toBe(403);
        expect(session.data.code).toBe("cart_customer_transfer_required");
      });

      it("accepts a registered email for guest checkout without inheriting the account or private groups", async () => {
        const owner = await customer();
        const { result: groups } = await createCustomerGroupsWorkflow(getContainer()).run({ input: {
          customersData: [{ name: `Private pricing ${randomUUID()}` }],
        } });
        await linkCustomersToCustomerGroupWorkflow(getContainer()).run({ input: {
          id: groups[0].id, add: [owner.customerId],
        } });
        const fresh = await createCart(undefined, owner.email);
        const edited = await createCart();
        const response = await request<HttpTypes.StoreCartResponse>("POST", `/store/carts/${edited.id}`, undefined, { email: owner.email });
        expect(response.status).toBe(200);
        for (const cart of [fresh, response.data.cart]) {
          expect(cart.customer_id).toEqual(expect.any(String));
          expect(cart.customer_id).not.toBe(owner.customerId);
          expect(cart.email).toBe(owner.email);
          const { data: guests } = await query().graph({
            entity: "customer", fields: ["id", "has_account", "first_name", "groups.id"],
            filters: { id: cart.customer_id },
          });
          expect(guests).toHaveLength(1);
          expect(guests[0].has_account).toBe(false);
          expect(guests[0].first_name).not.toBe("Private");
          expect(guests[0].groups).toEqual([]);
          expect((await request("GET", "/store/customers/me")).status).toBe(401);
        }
        const { data: owners } = await query().graph({
          entity: "customer", fields: ["id", "has_account", "groups.id"], filters: { id: owner.customerId },
        });
        expect(owners[0].has_account).toBe(true);
        expect(owners[0].groups).toEqual([expect.objectContaining({ id: groups[0].id })]);
        const guestOrder = await receiptFixture(fresh);
        expect(guestOrder.customer_id).not.toBe(owner.customerId);
        // Matching the email does not make the receipt part of A's account.
        expect((await request("GET", `/store/orders/${guestOrder.id}`, owner.token)).status).toBe(404);
        expect((await request("GET", `/store/orders/${guestOrder.id}`, owner.token, undefined, fresh.id)).status).toBe(404);
        expect((await request("GET", `/store/orders/${guestOrder.id}`, undefined, undefined, fresh.id)).status).toBe(200);
        const transferred = await request<HttpTypes.StoreCartResponse>("POST", `/store/carts/${edited.id}/customer`, owner.token, {});
        expect(transferred.status).toBe(200);
        expect(transferred.data.cart.id).toBe(edited.id);
        expect(transferred.data.cart.customer_id).toBe(owner.customerId);
        expect(transferred.data.cart.metadata).toEqual(edited.metadata);
        expect(transferred.data.cart.shipping_address).toEqual(edited.shipping_address);
      });

      it("requires the exact completed guest cart capability and native order_cart link for a receipt", async () => {
        const cart = await createCart();
        const otherCart = await createCart();
        const order = await receiptFixture(cart);
        for (const capability of [undefined, otherCart.id, "cart_forged"]) {
          const denied = await request("GET", `/store/orders/${order.id}`, undefined, undefined, capability);
          expect(denied.status).toBe(404);
        }
        const receipt = await request<HttpTypes.StoreOrderResponse>("GET", `/store/orders/${order.id}`, undefined, undefined, cart.id);
        expect(receipt.status).toBe(200);
        expect(receipt.data.order.id).toBe(order.id);
        const incompleteCart = await createCart();
        const incompleteOrder = await receiptFixture(incompleteCart, false);
        expect((await request("GET", `/store/orders/${incompleteOrder.id}`, undefined, undefined, incompleteCart.id)).status).toBe(404);
      });

      it("never lets a receipt header reveal a registered customer's order to B or a guest", async () => {
        const owner = await customer();
        const other = await customer();
        const cart = await createCart(owner.token, owner.email);
        const order = await receiptFixture(cart);
        for (const token of [undefined, other.token]) {
          for (const capability of [undefined, cart.id]) {
            expect((await request("GET", `/store/orders/${order.id}`, token, undefined, capability)).status).toBe(404);
          }
        }
        const receipt = await request<HttpTypes.StoreOrderResponse>("GET", `/store/orders/${order.id}?fields=id,customer_id`, owner.token);
        expect(receipt.status).toBe(200);
        expect(receipt.data.order.customer_id).toBe(owner.customerId);
      });

      it("does not let a completed guest cart be transferred or mutated after issuing its receipt", async () => {
        const buyer = await customer();
        const cart = await createCart();
        const order = await receiptFixture(cart);
        for (const [path, body, token] of [
          [`/store/carts/${cart.id}/customer`, {}, buyer.token],
          [`/store/carts/${cart.id}`, { metadata: { changed: true } }, undefined],
          ["/store/payment-collections", { cart_id: cart.id }, undefined],
        ] as const) {
          const response = await request("POST", path, token, body);
          expect(response.status).toBe(403);
          expect(response.data.code).toBe("cart_already_completed");
        }
        expect((await retrieveCart(cart.id)).customer_id).toBe(cart.customer_id);
        expect((await request("GET", `/store/orders/${order.id}`, undefined, undefined, cart.id)).status).toBe(200);
      });

      for (const surface of ["order receipt", "order list", "group detail", "group list", "completion retry"] as const) {
        it(`rejects cross-buyer projection through a shared region on ${surface}`, async () => {
          const owner = await customer();
          const other = await customer();
          const cart = await createCart(owner.token, owner.email);
          const otherCart = await createCart(other.token, other.email);
          const order = await receiptFixture(cart);
          const otherOrder = await receiptFixture(otherCart);
          const isCompletion = surface === "completion retry";
          const isGroup = isCompletion || surface.startsWith("group");
          const group = isGroup
            ? (await createFixtureOrderGroup(getContainer()).run({ input: {
              cart_id: cart.id, customer_id: owner.customerId, order_id: order.id,
            } })).result
            : undefined;
          if (isGroup) {
            await createFixtureOrderGroup(getContainer()).run({ input: {
              cart_id: otherCart.id, customer_id: other.customerId, order_id: otherOrder.id,
            } });
          }
          const method = isCompletion ? "POST" : "GET";
          const path = isCompletion ? `/store/carts/${cart.id}/complete`
            : surface === "group detail" ? `/store/order-groups/${group!.id}`
              : surface === "group list" ? "/store/order-groups"
                : surface === "order list" ? "/store/orders" : `/store/orders/${order.id}`;
          const validFields = isGroup
            ? "id,cart_id,orders.id,orders.email,orders.shipping_address.*"
            : "id,customer_id,email,shipping_address.*";
          const valid = await request(method, `${path}?fields=${encodeURIComponent(validFields)}`, owner.token, isCompletion ? {} : undefined);
          expect(valid.status).toBe(200);
          expect(JSON.stringify(valid.data)).toContain(order.id);
          expect(JSON.stringify(valid.data)).not.toContain(otherOrder.id);
          if (surface === "group detail") {
            expect((await request("GET", path, other.token)).status).toBe(404);
            expect((await request("GET", path)).status).toBe(401);
          }
          if (surface === "order list") {
            // Contract currently requested by apps/web/features/account/order-data.ts.
            const accountFields = [
              "+items.*", "+items.detail.*", "+items.variant.product.thumbnail", "+items.variant.product.images.url",
              "+seller.id", "+seller.name", "+shipping_address.*", "+billing_address.*", "+shipping_methods.*",
              "+fulfillments.id", "+fulfillments.created_at", "+fulfillments.packed_at", "+fulfillments.shipped_at",
              "+fulfillments.delivered_at", "+fulfillments.canceled_at", "+fulfillments.labels.tracking_number",
              "+fulfillments.labels.tracking_url", "+fulfillments.items.line_item_id", "+fulfillments.items.quantity",
              "+original_item_subtotal", "+original_shipping_subtotal", "+tax_total", "+discount_total",
              "+discount_tax_total", "+credit_line_total",
            ].join(",");
            const account = await request("GET", `${path}?fields=${encodeURIComponent(accountFields)}`, owner.token);
            expect(account.status).toBe(200);
            expect(JSON.stringify(account.data)).toContain(order.id);
            expect(JSON.stringify(account.data)).not.toContain(otherOrder.id);
          }
          const prefix = isGroup ? "orders." : "";
          const fields = `id,${prefix}region.orders.id,${prefix}region.orders.email,${prefix}region.orders.shipping_address.*`;
          const rejected = await request(method, `${path}?fields=${fields}`, owner.token, isCompletion ? {} : undefined);
          expect(JSON.stringify(rejected.data)).not.toContain(otherOrder.id);
          expect(JSON.stringify(rejected.data)).not.toContain(other.email);
          expect(rejected.status).toBe(400);
        });
      }

      it("disables every Store order-transfer action without revealing or changing the buyer's sale", async () => {
        const owner = await customer();
        const other = await customer();
        const cart = await createCart(owner.token, owner.email);
        const order = await receiptFixture(cart);
        const { result: group } = await createFixtureOrderGroup(getContainer()).run({ input: {
          cart_id: cart.id, customer_id: owner.customerId, order_id: order.id,
        } });
        const readState = async () => Promise.all([
          query().graph({ entity: "order", fields: ["id", "customer_id", "email"], filters: { id: order.id } }, { cache: { enable: false } }),
          query().graph({ entity: "cart", fields: ["id", "customer_id", "email", "completed_at"], filters: { id: cart.id } }, { cache: { enable: false } }),
          query().graph({ entity: "order_group", fields: ["id", "cart_id", "customer_id", "orders.id"], filters: { id: group.id } }, { cache: { enable: false } }),
          query().graph({ entity: "order_change", fields: ["id", "order_id", "change_type", "status"], filters: { order_id: order.id } }, { cache: { enable: false } }),
        ]);
        const before = await readState();
        expect(before[3].data).toEqual([]);
        for (const action of ["request", "cancel", "accept", "decline"]) {
          for (const token of [undefined, owner.token, other.token]) {
            for (const fields of ["", "?fields=id,region.orders.email"]) {
              const result = await request("POST", `/store/orders/${order.id}/transfer/${action}${fields}`, token,
                action === "accept" || action === "decline" ? { token: randomUUID() } : {});
              expect(result.status).toBe(400);
              expect(JSON.stringify(result.data)).not.toContain(owner.email);
              expect(JSON.stringify(result.data)).not.toContain(order.id);
              expect(JSON.stringify(result.data)).not.toContain("shipping_address");
            }
          }
        }
        expect(await readState()).toEqual(before);
      });

      it("rejects cart projections into related buyers while preserving the storefront cart contract", async () => {
        const owner = await customer();
        const other = await customer();
        const { result: groups } = await createCustomerGroupsWorkflow(getContainer()).run({ input: {
          customersData: [{ name: `Projection isolation ${randomUUID()}` }],
        } });
        await linkCustomersToCustomerGroupWorkflow(getContainer()).run({ input: {
          id: groups[0].id, add: [owner.customerId, other.customerId],
        } });
        const cart = await createCart(owner.token, owner.email);
        await createCart(other.token, other.email);
        const guest = await createCart();
        const cartFields = "*items,*items.variant,*items.variant.options,*items.variant.product,*items.variant.product.images,*items.offer,*items.offer.seller,*region,*region.countries,*shipping_address,*billing_address,*shipping_methods,*payment_collection,*payment_collection.payment_sessions";
        const valid = await request<HttpTypes.StoreCartResponse>("GET", `/store/carts/${cart.id}?fields=${encodeURIComponent(cartFields)}`, owner.token);
        expect(valid.status).toBe(200);
        expect(valid.data.cart.id).toBe(cart.id);
        expect(JSON.stringify(valid.data)).not.toContain(other.email);
        const cartIds = async () => (await query().graph({ entity: "cart", fields: ["id"] })).data.map(({ id }) => id).sort();
        const beforeIds = await cartIds();
        for (const field of ["customer.groups.customers.email", "items.offer.seller.customers.email", "items.variant.product.reviews.order.email"]) {
          const fields = `?fields=${encodeURIComponent(`id,${field}`)}`;
          const attempts: ["GET" | "POST", string, string | undefined, unknown?][] = [
            ["GET", `/store/carts/${cart.id}${fields}`, owner.token],
            ["POST", `/store/carts/${cart.id}${fields}`, owner.token, { metadata: { unauthorized_projection: true } }],
            ["POST", `/store/carts${fields}`, owner.token, { region_id: regionId, sales_channel_id: salesChannelId }],
            ["POST", `/store/carts/${guest.id}/customer${fields}`, owner.token, {}],
          ];
          for (const [method, path, token, body] of attempts) {
            const rejected = await request(method, path, token, body);
            expect(rejected.status).toBe(400);
            expect(rejected.data.message).toBe("Requested checkout fields are not available.");
            expect(JSON.stringify(rejected.data)).not.toContain(other.email);
          }
        }
        expect(await cartIds()).toEqual(beforeIds);
        expect((await retrieveCart(cart.id, owner.token)).metadata).toEqual(cart.metadata);
        expect((await retrieveCart(guest.id)).customer_id).toBe(guest.customer_id);
      });

      it("rejects checkout projections before payment or shipping side effects", async () => {
        const owner = await customer();
        const cart = await createCart(owner.token, owner.email);
        const collectionId = await paymentCollection(cart.id, owner.token);
        const attempts: ["GET" | "POST", string, unknown?][] = [
          ["POST", "/store/payment-collections?fields=id,cart.region.orders.email", { cart_id: cart.id }],
          ["POST", `/store/payment-collections/${collectionId}/payment-sessions?fields=id,cart.region.orders.email`, { provider_id: "pp_system_default" }],
          ["GET", `/store/shipping-options?cart_id=${cart.id}&fields=id,seller.orders.email`],
          ["POST", "/store/shipping-options/so_projection/calculate?fields=id,seller.orders.email", { cart_id: cart.id }],
        ];
        for (const [method, path, body] of attempts) {
          const rejected = await request(method, path, owner.token, body);
          expect(rejected.status).toBe(400);
          expect(rejected.data.message).toBe("Requested checkout fields are not available.");
        }
        const { data: collections } = await query().graph({
          entity: "payment_collection", fields: ["id", "payment_sessions.id"], filters: { id: collectionId },
        });
        expect(collections[0].payment_sessions).toEqual([]);
        const after = await retrieveCart(cart.id, owner.token);
        expect(after.customer_id).toBe(owner.customerId);
        expect(after.completed_at).toBeNull();
        expect(after.metadata).toEqual(cart.metadata);
        expect(after.shipping_methods).toEqual(cart.shipping_methods);
      });
    },
  });
}
