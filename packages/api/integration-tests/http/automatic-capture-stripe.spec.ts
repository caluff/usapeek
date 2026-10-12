/**
 * Explicit opt-in: real Stripe TEST IO, native checkout/fulfillment/finance,
 * disposable TLS PostgreSQL:55432 and Redis:56379/15. Seller account readiness
 * is a local fixture; this suite does not certify Connect onboarding or payouts.
 * The launcher must refund/cancel only this run's tagged Stripe objects and
 * delete its infrastructure, including when Jest fails.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { HttpTypes, IPaymentModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PolicyOperation } from "@medusajs/framework/utils";
import { createRbacPoliciesWorkflow, updateRbacRolesWorkflow } from "@medusajs/core-flows";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type Stripe from "stripe";
import { createStripeClient } from "../../src/lib/stripe-client";
import type { PaymentCaptureSettingsResponse } from "../../src/lib/order-finance/contracts";
import { capturePreparedPurchaseWorkflow } from "../../src/workflows/capture-prepared-purchase";
import { reconcileAutomaticCapturesWorkflow } from "../../src/workflows/reconcile-automatic-captures";
import { readOrderFinance } from "../../src/lib/order-finance/read";
import { prepareNativeCheckoutFixture, type NativeCheckoutFixture } from "../helpers/native-checkout-fixture";
import { isolatedCheckoutLifecycleEnvironment, linkSimulatedCheckoutAccount } from "../helpers/checkout-lifecycle-fixture";
import { configureNativeFinanceDatabaseTls } from "../helpers/native-finance-database-tls";
import { assertNativeFinanceRedis } from "../helpers/native-finance-redis-guard";
import { useNativeEsmPayoutProvider } from "../helpers/native-esm-provider-loader";

if (process.env.AUTOMATIC_CAPTURE_STRIPE_TESTS !== "disposable-stripe-test") {
  describe.skip("automatic capture with real Stripe TEST (explicit disposable environment required)", () => {
    it("requires the guarded launcher and cleanup", () => {});
  });
} else {
  // Reuse the existing pre-bootstrap isolation guard; it rejects all external
  // credentials before we explicitly enable this suite's Stripe TEST adapter.
  isolatedCheckoutLifecycleEnvironment();
  assertNativeFinanceRedis(process.env);
  const runId = process.env.CAPTURE_QA_RUN_ID ?? "";
  const keyPath = process.env.CAPTURE_QA_KEY_FILE ?? "";
  const ledgerPath = process.env.CAPTURE_QA_LEDGER_FILE ?? "";
  if (!/^[a-f0-9]{32}$/.test(runId) || !keyPath || !ledgerPath) {
    throw new Error("A private TEST key file and an owned cleanup ledger are required.");
  }
  const apiKey = readFileSync(keyPath, "utf8").trim();
  if (!/^sk_test_[A-Za-z0-9]+$/.test(apiKey)) throw new Error("Only a Stripe TEST key is permitted.");
  const dbName = `closure_finance_durability_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME!)}:${encodeURIComponent(process.env.DB_PASSWORD!)}@localhost:55432/${dbName}`;
  process.env.STRIPE_API_KEY = apiKey;
  // No external webhook endpoint or account configuration is changed.
  process.env.STRIPE_WEBHOOK_SECRET = `whsec_${runId}`;
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = `whsec_${runId}`;
  process.env.FINANCE_CHECKOUT_DATA_KIND = "qa_fixture";
  const stripe = createStripeClient(apiKey, { maxNetworkRetries: 2, timeout: 30_000 });
  const intents: string[] = [];
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: { beforeServerStart: async container => {
      const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
      assertNativeFinanceRedis(process.env, config);
      configureNativeFinanceDatabaseTls(config, dbName);
      await useNativeEsmPayoutProvider(config);
      if ((await stripe.balance.retrieve()).livemode) throw new Error("Stripe TEST is required.");
    } },
    testSuite: ({ api, getContainer }) => {
      let manifest: NativeCheckoutFixture;
      let adminToken: string;
      async function request<T = Record<string, unknown>>(method: "GET" | "POST", url: string, token?: string, data?: object, sellerId?: string) {
        const response = await api.request({ method, url, data, headers: {
          "x-publishable-api-key": manifest.publishable_key,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(sellerId ? { "x-seller-id": sellerId } : {}),
        }, validateStatus: () => true });
        return { status: response.status as number, data: response.data as T };
      }
      function ok<T>(response: { status: number; data: T }, route: string): T {
        if (response.status !== 200) throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(response.data)}`);
        return response.data;
      }
      async function login(actor: "customer" | "member" | "user", credentials: { email: string; password: string }) {
        return ok(await request<{ token: string }>("POST", `/auth/${actor}/emailpass`, undefined, credentials), "login").token;
      }
      beforeEach(async () => {
        manifest = await prepareNativeCheckoutFixture(getContainer(), { runId, scenario: "real-stripe-automatic-capture", inventoryQuantity: 20 });
        for (const vendor of manifest.vendors) {
          await linkSimulatedCheckoutAccount(getContainer()).run({ input: { seller_id: vendor.seller_id } });
        }
        const rbac = getContainer().resolve(Modules.RBAC);
        // Native update appends role policies; submit only the missing grants.
        const policyIds: string[] = [];
        for (const operation of [PolicyOperation.read, PolicyOperation.update]) {
          let policies = await rbac.listRbacPolicies({ resource: "store", operation });
          if (!policies.length) policies = (await createRbacPoliciesWorkflow(getContainer()).run({ input: {
            policies: [{ key: `store:${operation}`, resource: "store", operation }],
          } })).result;
          policyIds.push(...policies.map(policy => policy.id));
        }
        await updateRbacRolesWorkflow(getContainer()).run({ input: { selector: { id: manifest.admin.role_id }, update: { policy_ids: policyIds } } });
        adminToken = await login("user", manifest.admin.credentials);
      });
      afterEach(async () => {
        // The runner waits for persisted workflows, while these subscribers
        // also run inline. Drain their real queue before restoring PostgreSQL.
        const eventBus = getContainer().resolve(Modules.EVENT_BUS) as unknown as {
          queue_: { getJobCounts(...states: string[]): Promise<Record<string, number>> };
        };
        let idle = 0;
        for (let attempt = 0; attempt < 120; attempt++) {
          const counts = await eventBus.queue_.getJobCounts("active", "waiting", "delayed", "prioritized", "failed");
          expect(counts.failed).toBe(0);
          idle = ["active", "waiting", "delayed", "prioritized"].every(state => counts[state] === 0) ? idle + 1 : 0;
          if (idle >= 3) return;
          await delay(250);
        }
        throw new Error("Native event subscribers did not finish before database restoration.");
      });
      async function settings() {
        return ok(await request<PaymentCaptureSettingsResponse>("GET", "/admin/payment-capture-settings", adminToken), "read settings").settings;
      }
      async function mode(value: "manual" | "automatic") {
        const before = await settings();
        const saved = ok(await request<PaymentCaptureSettingsResponse>("POST", "/admin/payment-capture-settings", adminToken, { mode: value, expected_revision: before.revision }), "save settings");
        expect((await settings()).mode).toBe(value);
        return { before, saved: saved.settings };
      }
      async function checkout(quantity = 1) {
        const token = await login("customer", manifest.customer.credentials);
        const address = { first_name: "QA", last_name: "Stripe", address_1: "1 Test Street", city: "Seattle", province: "wa", postal_code: "98101", country_code: "us" };
        const cart = ok(await request<HttpTypes.StoreCartResponse>("POST", "/store/carts", token, {
          region_id: manifest.region_id, sales_channel_id: manifest.sales_channel_id,
          email: manifest.customer.credentials.email, shipping_address: address, billing_address: address,
        }), "create cart").cart;
        for (const [index, product] of manifest.products.entries()) {
          ok(await request("POST", `/store/carts/${cart.id}/line-items`, token, { offer_id: product.offer_id, quantity: index === 0 ? quantity : 1 }), "add item");
        }
        for (const vendor of manifest.vendors) {
          ok(await request("POST", `/store/carts/${cart.id}/shipping-methods`, token, { option_id: vendor.shipping_option_id }), "add shipping");
        }
        const collection = ok(await request<HttpTypes.StorePaymentCollectionResponse>("POST", "/store/payment-collections", token, { cart_id: cart.id }), "create collection").payment_collection;
        const session = ok(await request<HttpTypes.StorePaymentCollectionResponse>("POST", `/store/payment-collections/${collection.id}/payment-sessions`, token, {
          provider_id: "pp_stripe_stripe", data: { metadata: { capture_qa_run: runId } },
        }), "create Stripe session").payment_collection.payment_sessions![0];
        const intentId = session.data?.id;
        if (typeof intentId !== "string" || !intentId.startsWith("pi_")) throw new Error("Native Stripe session has no PaymentIntent.");
        intents.push(intentId);
        writeFileSync(ledgerPath, JSON.stringify({ run_id: runId, intents }), { encoding: "utf8" });
        const authorized = await stripe.paymentIntents.confirm(intentId, { payment_method: "pm_card_visa", return_url: "http://localhost/stripe-test" });
        expect(authorized.livemode).toBe(false);
        expect(authorized.status).toBe("requires_capture");
        expect(authorized.metadata.capture_qa_run).toBe(runId);
        const completed = ok(await request<{ type: string; order_group: { id: string } }>("POST", `/store/carts/${cart.id}/complete`, token, {}), "complete checkout");
        expect(completed.type).toBe("order_group");
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const { data: groups } = await query.graph({ entity: "order_group", fields: ["id", "orders.id", "orders.seller.id"], filters: { id: completed.order_group.id } }, { cache: { enable: false } });
        expect(groups[0].orders).toHaveLength(2);
        const orders = manifest.vendors.map(vendor => groups[0].orders!.find(order => order?.seller?.id === vendor.seller_id)!.id);
        return { token, intentId, collectionId: collection.id, orders, authorizedAmount: authorized.amount };
      }
      async function fulfill(orderId: string, vendorIndex: number, quantity = 1) {
        const vendor = manifest.vendors[vendorIndex];
        const token = await login("member", vendor.credentials);
        const order = ok(await request<HttpTypes.AdminOrderResponse>("GET", `/vendor/orders/${orderId}`, token, undefined, vendor.seller_id), "vendor order").order;
        ok(await request("POST", `/vendor/orders/${orderId}/fulfillments`, token, {
          items: order.items!.map(item => ({ id: item.id, quantity })), requires_shipping: true,
          location_id: vendor.location_id,
        }, vendor.seller_id), "native fulfillment");
      }
      async function noCapture(purchase: Awaited<ReturnType<typeof checkout>>) {
        await delay(1_500);
        const intent = await stripe.paymentIntents.retrieve(purchase.intentId);
        expect(intent.status).toBe("requires_capture");
        expect(intent.amount_received).toBe(0);
        const collection = await getContainer().resolve<IPaymentModuleService>(Modules.PAYMENT).retrievePaymentCollection(purchase.collectionId, { relations: ["payments", "payments.captures"] });
        expect(collection.payments).toHaveLength(1);
        expect(collection.payments![0].captures).toHaveLength(0);
      }
      async function captured(purchase: Awaited<ReturnType<typeof checkout>>, cents: number, allocations: number[]) {
        let intent: Stripe.PaymentIntent | undefined;
        for (let attempt = 0; attempt < 45; attempt++) {
          intent = await stripe.paymentIntents.retrieve(purchase.intentId);
          if (intent.status === "succeeded") break;
          await delay(750);
        }
        expect(intent?.status).toBe("succeeded");
        expect(intent?.amount_received).toBe(cents);
        expect(intent?.amount_capturable).toBe(0);
        // Wait for the native ledger after the external effect, which occurs first.
        for (let attempt = 0; attempt < 40; attempt++) {
          const current = await readOrderFinance(getContainer(), purchase.orders[0], { actor_id: manifest.admin.user_id });
          if (current.finalCapture) break;
          await delay(250);
        }
        const collection = await getContainer().resolve<IPaymentModuleService>(Modules.PAYMENT).retrievePaymentCollection(purchase.collectionId, { relations: ["payments", "payments.captures"] });
        expect(collection.payments).toHaveLength(1);
        expect(collection.payments![0].captures).toHaveLength(1);
        expect(Number(collection.payments![0].captures![0].amount)).toBe(cents / 100);
        for (const [index, orderId] of purchase.orders.entries()) {
          const current = await readOrderFinance(getContainer(), orderId, { actor_id: manifest.admin.user_id });
          expect(current.view.finance.captured_total).toBe(allocations[index]);
        }
      }
      it("waits for both stores and every quantity, captures once through the subscriber, and rejects forged settings", async () => {
        expect((await settings()).mode).toBe("manual");
        const changed = await mode("automatic");
        const stale = await request("POST", "/admin/payment-capture-settings", adminToken, { mode: "manual", expected_revision: changed.before.revision });
        expect(stale.status).toBe(409);
        const purchase = await checkout(2);
        const forged = await request("POST", "/admin/payment-capture-settings", purchase.token, { mode: "manual", expected_revision: changed.saved.revision });
        expect([401, 403]).toContain(forged.status);
        expect(purchase.authorizedAmount).toBe(6997);
        await noCapture(purchase);
        await fulfill(purchase.orders[1], 1);
        await noCapture(purchase);
        await fulfill(purchase.orders[0], 0, 1);
        await noCapture(purchase);
        await fulfill(purchase.orders[0], 0, 1);
        await captured(purchase, 6997, [44.98, 24.99]);
        await capturePreparedPurchaseWorkflow(getContainer()).run({ input: { order_id: purchase.orders[0] } });
        await capturePreparedPurchaseWorkflow(getContainer()).run({ input: { order_id: purchase.orders[1] } });
        await reconcileAutomaticCapturesWorkflow(getContainer()).run({ input: {} });
        // Replay Stripe's actual success event through the local signed HTTP
        // handler. Delivery is local; no external webhook endpoint is created.
        const events = await stripe.events.list({ type: "payment_intent.succeeded", limit: 100 });
        const event = events.data.find(entry => (entry.data.object as Stripe.PaymentIntent).id === purchase.intentId);
        expect(event?.livemode).toBe(false);
        if (!event) throw new Error("The TEST capture success event is missing.");
        const payload = JSON.stringify(event);
        for (let replay = 0; replay < 2; replay++) {
          const response = await api.post("/hooks/payment/stripe_stripe", payload, { headers: {
            "content-type": "application/json",
            "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! }),
          }, validateStatus: () => true });
          expect(response.status).toBe(200);
        }
        await delay(1_000);
        await captured(purchase, 6997, [44.98, 24.99]);
      });
      it("preserves manual capture and sweeps already prepared purchases after enabling automatic mode", async () => {
        const purchase = await checkout();
        await fulfill(purchase.orders[0], 0);
        await fulfill(purchase.orders[1], 1);
        await noCapture(purchase);
        await reconcileAutomaticCapturesWorkflow(getContainer()).run({ input: {} });
        await noCapture(purchase);
        await mode("automatic");
        await reconcileAutomaticCapturesWorkflow(getContainer()).run({ input: {} });
        await captured(purchase, 4998, [24.99, 24.99]);
      });
      it("excludes a canceled store and releases its unused authorization in one final capture", async () => {
        await mode("automatic");
        const purchase = await checkout();
        ok(await request("POST", `/admin/orders/${purchase.orders[1]}/finance`, adminToken, {
          action: "cancel", note: "Cancel disposable store before capture", confirm: true, request_id: randomUUID(),
        }), "finance cancellation");
        await noCapture(purchase);
        await fulfill(purchase.orders[0], 0);
        await captured(purchase, 2499, [24.99, 0]);
      });
      it("retains explicit operator capture when the setting is manual", async () => {
        const purchase = await checkout();
        await fulfill(purchase.orders[0], 0);
        await fulfill(purchase.orders[1], 1);
        await noCapture(purchase);
        ok(await request("POST", `/admin/orders/${purchase.orders[0]}/finance`, adminToken, {
          action: "capture", note: "Manual capture in disposable Stripe TEST", confirm: true, request_id: randomUUID(),
        }), "manual capture");
        await captured(purchase, 4998, [24.99, 24.99]);
      });
    },
  });
}
