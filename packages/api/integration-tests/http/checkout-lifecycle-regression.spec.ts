/**
 * Explicit opt-in + reserved TLS PG/Redis. Native HTTP/workflows/persistence;
 * local payment provider and simulated Connect readiness. NO Stripe network.
 * Never run alongside the persistent browser QA using Redis DB15.
 * Run after the guarded importer and exclusive infrastructure reservation:
 * CHECKOUT_LIFECYCLE_TESTS=disposable-local pnpm test:integration:http
 * --runTestsByPath integration-tests/http/checkout-lifecycle-regression.spec.ts
 */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@medusajs/framework/pg";
import type { HttpTypes, ILockingModule, IPaymentModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PaymentSessionStatus } from "@medusajs/framework/utils";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { suspendSellerWorkflow, unsuspendSellerWorkflow } from "@mercurjs/core/workflows";
import { COMMERCE_AUTOMATION_MODULE } from "../../src/modules/commerce-automation";
import type CommerceAutomationService from "../../src/modules/commerce-automation/service";
import { prepareNativeCheckoutFixture, type NativeCheckoutFixture } from "../helpers/native-checkout-fixture";
import {
  assertLifecycleBootstrap, isolatedCheckoutLifecycleEnvironment, linkSimulatedCheckoutAccount,
  localPaymentProvider, simulateCheckoutConfiguration,
} from "../helpers/checkout-lifecycle-fixture";

if (process.env.CHECKOUT_LIFECYCLE_TESTS !== "disposable-local") {
  describe.skip("checkout lifecycle regression", () => {
    it("requires explicitly reserved disposable PostgreSQL/Redis", () => {});
  });
} else {
  const dbName = isolatedCheckoutLifecycleEnvironment();
  jest.setTimeout(180_000);
  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: { beforeServerStart: async container => assertLifecycleBootstrap(container, dbName) },
    testSuite: ({ api, getContainer }) => {
      let manifest: NativeCheckoutFixture;
      const connection = () => new Client({
        host: "localhost", port: 55432, user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD, database: dbName, statement_timeout: 30_000,
      });
      async function request<T = Record<string, unknown>>(method: "GET" | "POST", url: string, token?: string, data?: object, sellerId?: string) {
        const response = await api.request({ method, url, data, headers: {
          "x-publishable-api-key": manifest.publishable_key,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(sellerId ? { "x-seller-id": sellerId } : {}),
        }, validateStatus: () => true });
        return { status: response.status as number, data: response.data as T };
      }
      async function login(actor: "customer" | "member" | "user", credentials: { email: string; password: string }) {
        const response = await request<{ token: string }>("POST", `/auth/${actor}/emailpass`, undefined, credentials);
        expect(response.status).toBe(200);
        expect(typeof response.data.token).toBe("string");
        return response.data.token;
      }
      async function fixture(stock: number) {
        manifest = await prepareNativeCheckoutFixture(getContainer(), {
          runId: randomUUID(), scenario: "checkout-lifecycle-local-provider", inventoryQuantity: stock,
        });
        for (const vendor of manifest.vendors) await linkSimulatedCheckoutAccount(getContainer()).run({ input: { seller_id: vendor.seller_id } });
        localPaymentProvider(getContainer());
        simulateCheckoutConfiguration(true);
      }
      afterEach(() => {
        jest.restoreAllMocks();
        simulateCheckoutConfiguration(false);
      });

      async function readyCart(customerIndex: number) {
        const customer = manifest.customers[customerIndex];
        const token = await login("customer", customer.credentials);
        const address = { first_name: "QA", last_name: "Lifecycle", address_1: "1 Test Street", city: "Seattle", province: "wa", postal_code: "98101", country_code: "us" };
        const created = await request<HttpTypes.StoreCartResponse>("POST", "/store/carts", token, {
          region_id: manifest.region_id, sales_channel_id: manifest.sales_channel_id,
          email: customer.credentials.email, shipping_address: address, billing_address: address,
        });
        expect(created.status).toBe(200);
        const cartId = created.data.cart.id;
        expect(created.data.cart.customer_id).toBe(customer.customer_id);
        const added = await request("POST", `/store/carts/${cartId}/line-items`, token, { offer_id: manifest.products[0].offer_id, quantity: 1 });
        expect(added.status).toBe(200);
        const shipping = await request("POST", `/store/carts/${cartId}/shipping-methods`, token, { option_id: manifest.vendors[0].shipping_option_id });
        expect(shipping.status).toBe(200);
        const collection = await request<HttpTypes.StorePaymentCollectionResponse>("POST", "/store/payment-collections", token, { cart_id: cartId });
        expect(collection.status).toBe(200);
        const collectionId = collection.data.payment_collection.id;
        const session = await request("POST", `/store/payment-collections/${collectionId}/payment-sessions`, token, { provider_id: "pp_system_default" });
        expect(session.status).toBe(200);
        return { cartId, collectionId, token };
      }
      const complete = (cart: Awaited<ReturnType<typeof readyCart>>) => request<{
        type: string; order_group?: { id: string; orders: { id: string }[] }; error?: { type: string };
      }>("POST", `/store/carts/${cart.cartId}/complete`, cart.token, {});

      async function persisted(cartIds: string[]) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "completed_at"], filters: { id: cartIds } }, { cache: { enable: false } });
        const { data: groups } = await query.graph({ entity: "order_group", fields: ["id", "cart_id", "orders.id", "orders.status", "orders.customer_id"], filters: { cart_id: cartIds } }, { cache: { enable: false } });
        const originals = await getContainer().resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE).listFinanceSaleSnapshots({ cart_id: cartIds });
        const client = connection();
        await client.connect();
        try {
          const levels = await client.query<{ stocked: number; reserved: number }>(
            "SELECT stocked_quantity::float8 AS stocked, reserved_quantity::float8 AS reserved FROM inventory_level WHERE inventory_item_id=$1 AND deleted_at IS NULL", [manifest.products[0].inventory_item_id]);
          const reservations = await client.query<{ quantity: number; line_item_id: string }>(
            "SELECT quantity::float8 AS quantity, line_item_id FROM reservation_item WHERE inventory_item_id=$1 AND deleted_at IS NULL", [manifest.products[0].inventory_item_id]);
          return { carts, groups, originals, levels: levels.rows, reservations: reservations.rows };
        } finally { await client.end(); }
      }
      async function noCapturedMoney(collectionIds: string[]) {
        const payment = getContainer().resolve<IPaymentModuleService>(Modules.PAYMENT);
        const collections = await payment.listPaymentCollections({ id: collectionIds }, { relations: ["payments", "payments.captures", "payments.refunds"] });
        const payments = collections.flatMap(collection => collection.payments ?? []);
        for (const entry of payments) {
          expect(entry.captures).toHaveLength(0);
          expect(entry.refunds).toHaveLength(0);
        }
        return payments;
      }

      it("completes exactly one of two independent buyer checkouts competing for the final unit", async () => {
        await fixture(1);
        const carts = [await readyCart(0), await readyCart(1)];
        const provider = localPaymentProvider(getContainer());
        const authorize = jest.spyOn(provider, "authorizePayment");
        const inventoryId = manifest.products[0].inventory_item_id;
        const locking = getContainer().resolve<ILockingModule>(Modules.LOCKING);
        // Observe calls while preserving the installed lock implementation and
        // callback. reserveInventoryStep serializes on Redis before PostgreSQL.
        const execute = jest.spyOn(locking, "execute");
        const blocker = connection();
        const observer = connection();
        await blocker.connect();
        await observer.connect();
        let responses: ReturnType<typeof complete>[] = [];
        let barrierError: unknown;
        try {
          await blocker.query("BEGIN");
          await blocker.query("SELECT id FROM inventory_level WHERE inventory_item_id=$1 AND deleted_at IS NULL FOR UPDATE", [manifest.products[0].inventory_item_id]);
          responses = carts.map(complete);
          // One checkout waits on this PG barrier; the other has entered native
          // locking.execute for the SAME inventory and waits on its Redis lock.
          // Requiring two PG waiters would deadlock against that native lock.
          const deadline = Date.now() + 5_000;
          let waiting = 0;
          let contenders = 0;
          while (Date.now() < deadline && (waiting < 1 || contenders < 2)) {
            const state = await observer.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%inventory_level%' AND pid<>pg_backend_pid()");
            waiting = state.rows[0].count;
            contenders = execute.mock.calls.filter(([keys]) =>
              Array.isArray(keys) && keys.length === 1 && keys[0] === inventoryId,
            ).length;
            if (waiting < 1 || contenders < 2) await delay(20);
          }
          expect(contenders).toBe(2);
          expect(waiting).toBe(1);
        } catch (error) { barrierError = error; }
        finally {
          await blocker.query("ROLLBACK");
          await blocker.end();
          await observer.end();
        }
        const results = await Promise.all(responses);
        if (barrierError) throw barrierError;
        const winners = results.flatMap((result, index) => result.status === 200 && result.data.type === "order_group" ? [index] : []);
        expect(winners).toHaveLength(1);
        const winner = winners[0];
        const loser = winner === 0 ? 1 : 0;
        expect(results[loser].status).toBe(400);
        expect(authorize).toHaveBeenCalledTimes(1);
        const state = await persisted(carts.map(cart => cart.cartId));
        expect(state.groups).toHaveLength(1);
        expect(state.groups[0].cart_id).toBe(carts[winner].cartId);
        expect(state.groups[0].orders).toHaveLength(1);
        expect(state.originals).toHaveLength(1);
        expect(state.originals[0].cart_id).toBe(carts[winner].cartId);
        expect(state.groups[0].orders![0]!.customer_id).toBe(manifest.customers[winner].customer_id);
        expect(state.levels).toEqual([{ stocked: 1, reserved: 1 }]);
        expect(state.reservations).toHaveLength(1);
        expect(state.reservations[0].quantity).toBe(1);
        expect(state.carts.find(cart => cart.id === carts[loser].cartId)?.completed_at).toBeNull();
        expect(await noCapturedMoney(carts.map(cart => cart.collectionId))).toHaveLength(1);
        const retry = await complete(carts[winner]);
        expect(retry.data.order_group?.id).toBe(results[winner].data.order_group?.id);
        expect(authorize).toHaveBeenCalledTimes(1);
      });

      it("preserves an active order while suspension blocks vendor access and new checkout until reinstatement", async () => {
        await fixture(3);
        const active = await readyCart(0);
        const pending = await readyCart(1);
        const completed = await complete(active);
        expect(completed.status).toBe(200);
        expect(completed.data.type).toBe("order_group");
        // Completion intentionally returns a minimal safe Store projection.
        // Resolve the test's persisted order without widening that API contract.
        const completedState = await persisted([active.cartId]);
        expect(completedState.groups).toHaveLength(1);
        expect(completedState.groups[0].id).toBe(completed.data.order_group!.id);
        expect(completedState.groups[0].orders).toHaveLength(1);
        const orderId = completedState.groups[0].orders![0]!.id;
        const vendor = manifest.vendors[0];
        const ownerToken = await login("member", vendor.credentials);
        const foreignToken = await login("member", manifest.vendors[1].credentials);
        const adminToken = await login("user", manifest.admin.credentials);
        const ownBefore = await request<HttpTypes.AdminOrderResponse>("GET", `/vendor/orders/${orderId}`, ownerToken, undefined, vendor.seller_id);
        expect(ownBefore.status).toBe(200);
        const fulfillmentBody = {
          items: ownBefore.data.order.items!.map(item => ({ id: item.id, quantity: 1 })),
          requires_shipping: true, location_id: vendor.location_id,
        };
        await suspendSellerWorkflow(getContainer()).run({ input: { seller_id: vendor.seller_id, reason: "Disposable checkout lifecycle regression" } });
        const authorize = jest.spyOn(localPaymentProvider(getContainer()), "authorizePayment");
        const rejected = await complete(pending);
        expect(rejected.status).toBe(400);
        expect(authorize).not.toHaveBeenCalled();
        const receipt = await request<HttpTypes.StoreOrderResponse>("GET", `/store/orders/${orderId}`, active.token);
        expect(receipt.status).toBe(200);
        expect(receipt.data.order.id).toBe(orderId);
        const retry = await complete(active);
        expect(retry.data.order_group?.id).toBe(completed.data.order_group?.id);
        // Existing vendorLiveGuard deliberately requires an OPEN seller for
        // operational routes, including reads. Suspension must not weaken it.
        const own = await request("GET", `/vendor/orders/${orderId}`, ownerToken, undefined, vendor.seller_id);
        expect(own.status).toBe(403);
        expect(own.data.code).toBe("seller_not_open");
        const blockedFulfillment = await request("POST", `/vendor/orders/${orderId}/fulfillments`, ownerToken, fulfillmentBody, vendor.seller_id);
        expect(blockedFulfillment.status).toBe(403);
        expect(blockedFulfillment.data.code).toBe("seller_not_open");
        const operatorView = await request<HttpTypes.AdminOrderResponse>("GET", `/admin/orders/${orderId}`, adminToken);
        expect(operatorView.status).toBe(200);
        expect(operatorView.data.order.id).toBe(orderId);
        expect(operatorView.data.order.fulfillments ?? []).toHaveLength(0);
        const foreign = await request("GET", `/vendor/orders/${orderId}`, foreignToken, undefined, manifest.vendors[1].seller_id);
        expect(foreign.status).toBe(404);
        const forged = await request("GET", `/vendor/orders/${orderId}`, foreignToken, undefined, vendor.seller_id);
        // Native membership middleware returns 400; application membership
        // guard returns 403. Both must deny before returning order data.
        expect([400, 403]).toContain(forged.status);
        expect(forged.data.type).toBe("not_allowed");
        expect(forged.data.order).toBeUndefined();
        const suspended = await persisted([active.cartId, pending.cartId]);
        expect(suspended.groups).toEqual(completedState.groups);
        expect(suspended.originals).toEqual(completedState.originals);
        expect(suspended.levels).toEqual(completedState.levels);
        expect(suspended.reservations).toEqual(completedState.reservations);
        expect(await noCapturedMoney([active.collectionId, pending.collectionId])).toHaveLength(1);
        // Native reinstatement re-enables the same owner's existing order,
        // proving that access is revalidated instead of cached across requests.
        await unsuspendSellerWorkflow(getContainer()).run({ input: { seller_id: vendor.seller_id } });
        const restored = await request<HttpTypes.AdminOrderResponse>("GET", `/vendor/orders/${orderId}`, ownerToken, undefined, vendor.seller_id);
        expect(restored.status).toBe(200);
        expect(restored.data.order.id).toBe(orderId);
        const fulfillment = await request("POST", `/vendor/orders/${orderId}/fulfillments`, ownerToken, fulfillmentBody, vendor.seller_id);
        expect(fulfillment.status).toBe(200);
        const after = await request<HttpTypes.AdminOrderResponse>("GET", `/vendor/orders/${orderId}`, ownerToken, undefined, vendor.seller_id);
        expect(after.data.order.fulfillment_status).toBe("fulfilled");
        const state = await persisted([active.cartId, pending.cartId]);
        expect(state.groups).toHaveLength(1);
        expect(state.groups[0].orders![0]!.status).toBe("pending");
        expect(await noCapturedMoney([active.collectionId, pending.collectionId])).toHaveLength(1);
      });

      it("rolls back completion when the local provider reports a canceled authorization, then permits a fresh session", async () => {
        await fixture(1);
        const cart = await readyCart(0);
        const provider = localPaymentProvider(getContainer());
        // Simulates the provider result of an expired authorization; does not
        // advance a Stripe clock or certify expiration of an actual Stripe hold.
        const authorize = jest.spyOn(provider, "authorizePayment").mockResolvedValueOnce({
          status: PaymentSessionStatus.CANCELED, data: { cancellation_reason: "expired_authorization_simulation" },
        });
        const result = await complete(cart);
        // Installed 2.18 propagates NOT_ALLOWED from the payment module for
        // CANCELED; it does not return the 200/requires-action response branch.
        expect(result.status).toBe(400);
        expect(result.data.type).toBe("not_allowed");
        expect(authorize).toHaveBeenCalledTimes(1);
        const state = await persisted([cart.cartId]);
        expect(state.groups).toHaveLength(0);
        expect(state.originals).toHaveLength(0);
        expect(state.carts[0].completed_at).toBeNull();
        expect(state.levels).toEqual([{ stocked: 1, reserved: 0 }]);
        expect(state.reservations).toHaveLength(0);
        expect(await noCapturedMoney([cart.collectionId])).toHaveLength(0);
        authorize.mockRestore();
        const renewed = await request("POST", `/store/payment-collections/${cart.collectionId}/payment-sessions`, cart.token, { provider_id: "pp_system_default" });
        expect(renewed.status).toBe(200);
        const recovered = await complete(cart);
        expect(recovered.status).toBe(200);
        expect(recovered.data.type).toBe("order_group");
        expect((await persisted([cart.cartId])).reservations).toHaveLength(1);
        expect(await noCapturedMoney([cart.collectionId])).toHaveLength(1);
      });
    },
  });
}
