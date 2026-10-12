/**
 * ORDER_TRACKING_TESTS=disposable-local opts into native HTTP/workflows on a
 * random database owned by Medusa's runner. Requires exclusively reserved TLS
 * PostgreSQL:55432 and Redis:56379/15. No external providers or email delivery.
 */
import { randomUUID } from "node:crypto";
import type { CreateOrderDTO, HttpTypes, IAuthModuleService, ILockingModule, OrderDTO, UpdateOrderDTO } from "@medusajs/framework/types";
import { ChangeActionType, ContainerRegistrationKeys, generateJwtToken, Modules, OrderStatus } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  acceptOrderTransferWorkflow,
  createApiKeysWorkflow,
  createCartsStep,
  createCustomerAccountWorkflow,
  createCustomersWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  createOrdersStep,
  createRemoteLinkStep,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  requestOrderTransferWorkflow,
  updateOrdersStep,
  updateProductsWorkflow,
} from "@medusajs/core-flows";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createOrderGroupStep } from "@mercurjs/core/workflows";
import { MercurModules } from "@mercurjs/types";
import {
  createOrderTrackingToken,
  ORDER_TRACKING_MAX_AGE_SECONDS,
} from "../../src/lib/order-tracking/access";
import type { StoreOrderTrackingResponse } from "../../src/lib/order-tracking/contracts";
import type { StoreOrderTrackingClaimResponse } from "../../src/lib/order-tracking/claim-contracts";
import { assertLifecycleBootstrap, isolatedCheckoutLifecycleEnvironment } from "../helpers/checkout-lifecycle-fixture";
import { prepareNativeCheckoutFixture } from "../helpers/native-checkout-fixture";

if (process.env.ORDER_TRACKING_TESTS !== "disposable-local") {
  describe.skip("private order tracking (requires disposable-local opt-in)", () => {
    it("requires exclusive isolated PostgreSQL and TLS Redis", () => {});
  });
} else {
  const dbName = isolatedCheckoutLifecycleEnvironment();
  jest.setTimeout(180_000);

  const createTrackingOrderFixture = createWorkflow(
    "order-tracking-test-create-order",
    // Native 2.18 creation accepts this persisted field, absent from its input DTO.
    function (input: (CreateOrderDTO & Pick<OrderDTO, "is_draft_order">)[]) {
      return new WorkflowResponse(createOrdersStep(input));
    },
  );
  const updateTrackingOrderFixture = createWorkflow(
    "order-tracking-test-update-order",
    function (input: { id: string; update: Pick<UpdateOrderDTO, "email" | "status"> }) {
      return new WorkflowResponse(updateOrdersStep({ selector: { id: input.id }, update: input.update }));
    },
  );
  // Native receipt links isolate ownership; this fixture does not simulate payment.
  const groupTrackingOrdersFixture = createWorkflow(
    "order-tracking-test-group-orders",
    function (input: { customer_id: string; email: string; order_ids: string[] }) {
      const carts = createCartsStep([{ currency_code: "usd", customer_id: input.customer_id, email: input.email }]);
      const group = createOrderGroupStep({ cart_id: carts[0].id, customer_id: input.customer_id });
      createRemoteLinkStep(transform({ carts, group, input }, ({ carts, group, input }) => [
        ...input.order_ids.map(order_id => ({
          [Modules.ORDER]: { order_id }, [Modules.CART]: { cart_id: carts[0].id },
        })),
        ...input.order_ids.map(order_id => ({
          [MercurModules.SELLER]: { order_group_id: group.id }, [Modules.ORDER]: { order_id },
        })),
      ]));
      return new WorkflowResponse(transform({ carts, group }, ({ carts, group }) => ({ cart_id: carts[0].id, group_id: group.id })));
    },
  );

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: { beforeServerStart: async container => assertLifecycleBootstrap(container, dbName) },
    testSuite: ({ api, getContainer }) => {
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY);
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      function customerToken(identityId: string, customerId: string, provider = "google", actorType = "customer") {
        const { http } = getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig;
        return generateJwtToken({
          actor_id: customerId, actor_type: actorType, auth_identity_id: identityId, auth_provider: provider, app_metadata: {},
        }, { secret: http.jwtSecret, expiresIn: "10m", jwtOptions: http.jwtOptions });
      }
      async function googleAccount(email: string, provider = "google", googleEmail = email) {
        // OAuth verification is represented by native provider records, without Google requests.
        const identity = await auth().createAuthIdentities({ provider_identities: [{
          provider, entity_id: provider === "emailpass" ? email : randomUUID(),
          user_metadata: { email: googleEmail, email_verified: true },
        }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({
          input: { authIdentityId: identity.id, customerData: { email } },
        });
        return { customer, identity, jwt: customerToken(identity.id, customer.id, provider) };
      }
      async function storeKey() {
        const { result: channels } = await createSalesChannelsWorkflow(getContainer()).run({
          input: { salesChannelsData: [{ name: `Tracking test ${randomUUID()}` }] },
        });
        const { result: keys } = await createApiKeysWorkflow(getContainer()).run({
          input: { api_keys: [{ title: "Private order tracking test", type: "publishable", created_by: "order-tracking-test" }] },
        });
        await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({
          input: { id: keys[0].id, add: [channels[0].id] },
        });
        return keys[0].token;
      }

      async function guestOrder(isDraft = false, variantId?: string, owner?: { id: string; email: string }) {
        const email = owner?.email ?? `tracking-guest-${randomUUID()}@example.invalid`;
        const customers = owner ? [owner] : (await createCustomersWorkflow(getContainer()).run({
          input: { customersData: [{ email, has_account: false, first_name: "Private guest", phone: "+12065550123" }] },
        })).result;
        const { result: orders } = await createTrackingOrderFixture(getContainer()).run({ input: [{
          email, customer_id: customers[0].id, currency_code: "usd", is_draft_order: isDraft,
          metadata: { private_checkout_note: "Do not expose this note" },
          shipping_address: {
            first_name: "Private", last_name: "Buyer", address_1: "1 Private Street",
            city: "Seattle", province: "wa", postal_code: "98101", country_code: "us", phone: "+12065550123",
          },
          billing_address: { first_name: "Private", address_1: "2 Private Street", country_code: "us" },
          items: [{ title: "Guest tracking item", variant_id: variantId, variant_title: "Blue", quantity: 2, unit_price: 19.99, requires_shipping: true }],
        }] });
        return { ...orders[0], email };
      }

      async function tracking(key: string | undefined, body: object, query = "") {
        const response = await api.post(`/store/order-tracking${query}`, body, {
          headers: key ? { "x-publishable-api-key": key } : {},
          validateStatus: () => true,
        });
        return {
          status: response.status as number,
          headers: response.headers as Record<string, string>,
          data: response.data as StoreOrderTrackingResponse,
        };
      }

      async function claim(key: string | undefined, body: object, jwt?: string) {
        const response = await api.post("/store/order-tracking/claim", body, {
          headers: { ...(key ? { "x-publishable-api-key": key } : {}), ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
          validateStatus: () => true,
        });
        return {
          status: response.status as number,
          headers: response.headers as Record<string, string>,
          data: response.data as StoreOrderTrackingClaimResponse,
        };
      }

      async function orderOwnership(id: string) {
        const { data: [order] } = await query().graph({
          entity: "order", fields: ["id", "customer_id", "email", "version", "status"], filters: { id },
        }, { cache: { enable: false } });
        return order;
      }

      async function orderTransfers(id: string) {
        return (await query().graph({
          entity: "order_change",
          fields: ["id", "status", "created_by", "change_type", "actions.action", "actions.reference_id", "actions.details"],
          filters: { order_id: id, change_type: "transfer" },
        }, { cache: { enable: false } })).data;
      }

      async function accountOrders(key: string, jwt: string) {
        const response = await api.get("/store/orders?fields=id,customer_id,email", {
          headers: { "x-publishable-api-key": key, authorization: `Bearer ${jwt}` },
        });
        return (response.data as HttpTypes.StoreOrderListResponse).orders;
      }

      it("lets a guest follow exactly one order while exposing only the tracking projection", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const token = createOrderTrackingToken(order);
        // There is no JWT, session cookie or completed-cart receipt capability.
        const response = await tracking(key, { token });
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.data.order).toMatchObject({
          display_id: order.display_id, status: "pending", fulfillment_status: "not_fulfilled",
          currency_code: "usd", total: 39.98,
          items: [{ title: "Guest tracking item", variant_title: "Blue", quantity: 2, unit_price: 19.99 }],
        });
        expect(Object.keys(response.data)).toEqual(["order"]);
        expect(Object.keys(response.data.order).sort()).toEqual([
          "created_at", "currency_code", "custom_display_id", "display_id", "fulfillment_status",
          "fulfillments", "items", "status", "total",
        ]);
        const json = JSON.stringify(response.data);
        for (const privateValue of [order.id, order.email, order.customer_id, "+12065550123", "Private Street", "Do not expose this note"]) {
          expect(json).not.toContain(privateValue);
        }
        for (const privateKey of ["customer", "shipping_address", "billing_address", "metadata", "payment_status", "payment_collections"])
          expect(response.data.order).not.toHaveProperty(privateKey);

        // Publishable-key validation remains native, even with a valid link.
        expect((await tracking(undefined, { token })).status).toBe(400);
        // Query expansion must not widen the fixed private projection.
        const expanded = await tracking(key, { token }, "?fields=*customer,*shipping_address,*payment_collections");
        expect(expanded.status).toBe(200);
        expect(expanded.data).toEqual(response.data);
      });

      it("rejects missing, forged, expired, mismatched and draft links without exposing order data", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const token = createOrderTrackingToken(order);
        const forged = `${token.slice(0, -2)}${token[token.length - 2] === "A" ? "B" : "A"}${token[token.length - 1]}`;
        const expired = createOrderTrackingToken(order, process.env, Date.now() - (ORDER_TRACKING_MAX_AGE_SECONDS + 1) * 1000);
        const wrongRecipient = createOrderTrackingToken({ id: order.id, email: "another-buyer@example.invalid" });
        const missingOrder = createOrderTrackingToken({ id: `order_${randomUUID().replaceAll("-", "")}`, email: order.email });
        const draft = await guestOrder(true);

        for (const body of [{}, { token: "invalid" }, { token, email: order.email }]) {
          const response = await tracking(key, body);
          expect(response.status).toBe(400);
          expect(response.data).not.toHaveProperty("order");
        }
        for (const rejectedToken of [forged, expired, wrongRecipient, missingOrder, createOrderTrackingToken(draft)]) {
          const response = await tracking(key, { token: rejectedToken });
          expect(response.status).toBe(404);
          expect(response.data).not.toHaveProperty("order");
          expect(JSON.stringify(response.data)).not.toContain(order.email);
        }
        expect((await tracking(key, { token })).status).toBe(200);

        await updateTrackingOrderFixture(getContainer()).run({ input: {
          id: order.id, update: { email: "changed-recipient@example.invalid", status: OrderStatus.CANCELED },
        } });
        expect((await tracking(key, { token })).status).toBe(404);
        const replacement = createOrderTrackingToken({ id: order.id, email: "changed-recipient@example.invalid" });
        const canceled = await tracking(key, { token: replacement });
        expect(canceled.status).toBe(200);
        expect(canceled.data.order.status).toBe("canceled");
      });

      it("associates only the linked guest order with the Google account and remains idempotent", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const guest = { id: order.customer_id!, email: order.email };
        const unrelatedOrder = await guestOrder(false, undefined, guest);
        const { result: receipt } = await groupTrackingOrdersFixture(getContainer()).run({ input: {
          customer_id: guest.id, email: guest.email, order_ids: [order.id, unrelatedOrder.id],
        } });
        const account = await googleAccount(order.email);
        const token = createOrderTrackingToken(order);
        const readReceipt = async () => {
          const [customer, cart, group] = await Promise.all([
            query().graph({ entity: "customer", fields: ["id", "email", "has_account"], filters: { id: guest.id } }, { cache: { enable: false } }),
            query().graph({ entity: "cart", fields: ["id", "email", "customer_id"], filters: { id: receipt.cart_id } }, { cache: { enable: false } }),
            query().graph({ entity: "order_group", fields: ["id", "cart_id", "customer_id", "orders.id"], filters: { id: receipt.group_id } }, { cache: { enable: false } }),
          ]);
          return { customer: customer.data[0], cart: cart.data[0], group: group.data[0] };
        };
        const originalReceipt = await readReceipt();
        expect(originalReceipt.customer).toMatchObject({ id: guest.id, has_account: false });
        const originalOtherOrder = await orderOwnership(unrelatedOrder.id);
        expect(await accountOrders(key, account.jwt)).toEqual([]);

        const response = await claim(key, { token }, account.jwt);
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.data).toEqual({ status: "associated", order_id: order.id });
        const ownership = await orderOwnership(order.id);
        expect(ownership).toMatchObject({ customer_id: account.customer.id, email: order.email });
        expect((await accountOrders(key, account.jwt)).map(entry => entry.id)).toEqual([order.id]);
        const accountHeaders = { "x-publishable-api-key": key, authorization: `Bearer ${account.jwt}` };
        const detail = await api.get(`/store/orders/${order.id}?fields=id,customer_id,email`, { headers: accountHeaders });
        expect((detail.data as HttpTypes.StoreOrderResponse).order).toMatchObject({ id: order.id, customer_id: account.customer.id });
        const otherDetail = await api.get(`/store/orders/${unrelatedOrder.id}`, { headers: accountHeaders, validateStatus: () => true });
        expect(otherDetail.status).toBe(404);
        const transfers = await orderTransfers(order.id);
        expect(transfers).toHaveLength(1);
        expect(transfers[0]).toMatchObject({ status: "confirmed", created_by: account.customer.id });
        expect(transfers[0].actions).toEqual([expect.objectContaining({
          action: ChangeActionType.TRANSFER_CUSTOMER, reference_id: account.customer.id,
          details: expect.objectContaining({ original_email: order.email }),
        })]);
        expect(transfers[0].actions![0]!.details).not.toHaveProperty("new_email");

        const repeated = await claim(key, { token }, account.jwt);
        expect(repeated.status).toBe(200);
        expect(repeated.data).toEqual(response.data);
        expect(await orderOwnership(order.id)).toEqual(ownership);
        expect(await orderTransfers(order.id)).toEqual(transfers);
        expect(await readReceipt()).toEqual(originalReceipt);
        expect(await orderOwnership(unrelatedOrder.id)).toEqual(originalOtherOrder);
        expect((await tracking(key, { token })).status).toBe(200);
        const transferProof = transfers[0].actions![0]!.details?.token;
        if (typeof transferProof !== "string") throw new Error("Native transfer did not persist its private proof.");
        await expect(acceptOrderTransferWorkflow(getContainer()).run({ input: { order_id: order.id, token: transferProof } }))
          .rejects.toMatchObject({ type: "invalid_data" });
        // Direct storefront transfer routes remain blocked independently of claim.
        const replay = await api.post(`/store/orders/${order.id}/transfer/accept`, { token: transferProof }, {
          headers: { "x-publishable-api-key": key }, validateStatus: () => true,
        });
        expect(replay.status).toBe(400);
        expect(await orderOwnership(order.id)).toEqual(ownership);
        expect(await orderTransfers(order.id)).toEqual(transfers);

        // A later cancellation does not undo an already established association.
        await updateTrackingOrderFixture(getContainer()).run({ input: { id: order.id, update: { status: OrderStatus.CANCELED } } });
        expect((await claim(key, { token }, account.jwt)).status).toBe(200);
        expect(await orderTransfers(order.id)).toEqual(transfers);
      });

      it("associates a native guest order without requiring a cart or order-group link", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const account = await googleAccount(order.email);
        const response = await claim(key, { token: createOrderTrackingToken(order) }, account.jwt);
        expect({ status: response.status, data: response.data }).toEqual({
          status: 200, data: { status: "associated", order_id: order.id },
        });
        expect(await orderOwnership(order.id)).toMatchObject({ customer_id: account.customer.id, email: order.email });
        expect((await accountOrders(key, account.jwt)).map(entry => entry.id)).toEqual([order.id]);
      });

      it("requires a canonical Google customer, matching recipient, valid signature and transferable order", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const token = createOrderTrackingToken(order);
        const account = await googleAccount(order.email);
        const otherAccount = await googleAccount(`tracking-other-${randomUUID()}@example.invalid`);
        const passwordAccount = await googleAccount(`tracking-password-${randomUUID()}@example.invalid`, "emailpass");
        const mismatchedGoogle = await googleAccount(`tracking-mismatch-${randomUUID()}@example.invalid`, "google", order.email);
        const forged = `${token.slice(0, -2)}${token[token.length - 2] === "A" ? "B" : "A"}${token[token.length - 1]}`;
        const expired = createOrderTrackingToken(order, process.env, Date.now() - (ORDER_TRACKING_MAX_AGE_SECONDS + 1) * 1000);
        const original = await orderOwnership(order.id);

        for (const jwt of [
          undefined,
          customerToken(account.identity.id, account.customer.id, "emailpass"),
          customerToken(account.identity.id, account.customer.id, "google", "user"),
          customerToken(passwordAccount.identity.id, passwordAccount.customer.id),
          customerToken(account.identity.id, otherAccount.customer.id),
          mismatchedGoogle.jwt,
        ]) {
          const response = await claim(key, { token }, jwt);
          expect(response.status).toBe(401);
          expect(response.data).not.toHaveProperty("order_id");
        }
        for (const rejectedToken of [
          forged, expired, createOrderTrackingToken({ id: order.id, email: otherAccount.customer.email! }),
          createOrderTrackingToken({ id: `order_${randomUUID().replaceAll("-", "")}`, email: order.email }),
        ]) {
          const response = await claim(key, { token: rejectedToken }, account.jwt);
          expect(response.status).toBe(404);
          expect(response.data).not.toHaveProperty("order_id");
        }
        expect((await claim(key, { token }, otherAccount.jwt)).status).toBe(404);
        for (const body of [{}, { token: "invalid" }, { token, customer_id: account.customer.id }])
          expect((await claim(key, body, account.jwt)).status).toBe(400);
        expect((await claim(undefined, { token }, account.jwt)).status).toBe(400);
        expect(await orderOwnership(order.id)).toEqual(original);
        expect(await orderTransfers(order.id)).toEqual([]);

        const guest = { id: order.customer_id!, email: order.email };
        const draft = await guestOrder(true, undefined, guest);
        const canceled = await guestOrder(false, undefined, guest);
        await updateTrackingOrderFixture(getContainer()).run({ input: { id: canceled.id, update: { status: OrderStatus.CANCELED } } });
        const ownedByOther = await guestOrder(false, undefined, { id: otherAccount.customer.id, email: order.email });
        for (const [rejectedOrder, status] of [[draft, 404], [canceled, 400], [ownedByOther, 400]] as const) {
          const ownership = await orderOwnership(rejectedOrder.id);
          expect((await claim(key, { token: createOrderTrackingToken(rejectedOrder) }, account.jwt)).status).toBe(status);
          expect(await orderOwnership(rejectedOrder.id)).toEqual(ownership);
          expect(await orderTransfers(rejectedOrder.id)).toEqual([]);
        }
      });

      it("serializes concurrent claims without creating duplicate transfers", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const account = await googleAccount(order.email);
        const otherAccount = await googleAccount(`tracking-competing-${randomUUID()}@example.invalid`);
        const token = createOrderTrackingToken(order);
        const otherOrder = await guestOrder(false, undefined, { id: order.customer_id!, email: order.email });
        await groupTrackingOrdersFixture(getContainer()).run({ input: {
          customer_id: order.customer_id!, email: order.email, order_ids: [order.id, otherOrder.id],
        } });
        const { data: [source] } = await query().graph({
          entity: "order", fields: ["id", "customer_id", "customer.id", "customer.has_account"], filters: { id: order.id },
        }, { cache: { enable: false } });
        expect(source).toMatchObject({ customer_id: order.customer_id, customer: { id: order.customer_id, has_account: false } });
        const results = await Promise.all([
          claim(key, { token }, account.jwt), claim(key, { token }, account.jwt), claim(key, { token }, otherAccount.jwt),
        ]);
        expect(results[2].status).toBe(404);
        expect(results.slice(0, 2).map(({ status, data }) => ({ status, data }))).toEqual([
          { status: 200, data: { status: "associated", order_id: order.id } },
          { status: 200, data: { status: "associated", order_id: order.id } },
        ]);
        expect(await orderOwnership(order.id)).toMatchObject({ customer_id: account.customer.id, email: order.email });
        expect(await orderTransfers(order.id)).toHaveLength(1);
        expect(await orderOwnership(otherOrder.id)).toMatchObject({ customer_id: order.customer_id, email: order.email });
      });

      it("preserves another customer's pending native transfer proof across failed claims", async () => {
        const key = await storeKey();
        const pendingOrder = await guestOrder();
        const account = await googleAccount(pendingOrder.email);
        const otherAccount = await googleAccount(`tracking-pending-${randomUUID()}@example.invalid`);
        await groupTrackingOrdersFixture(getContainer()).run({ input: {
          customer_id: pendingOrder.customer_id!, email: pendingOrder.email, order_ids: [pendingOrder.id],
        } });
        await requestOrderTransferWorkflow(getContainer()).run({ input: {
          order_id: pendingOrder.id, customer_id: otherAccount.customer.id,
          logged_in_user: otherAccount.customer.id, update_order_email: false,
        } });
        const pendingOwnership = await orderOwnership(pendingOrder.id);
        const pendingProof = await orderTransfers(pendingOrder.id);
        expect(pendingProof).toHaveLength(1);
        expect(pendingProof[0]).toMatchObject({ status: "requested", created_by: otherAccount.customer.id });
        for (let attempt = 0; attempt < 2; attempt++) {
          const rejected = await claim(key, { token: createOrderTrackingToken(pendingOrder) }, account.jwt);
          expect(rejected.status).toBe(400);
          expect(await orderOwnership(pendingOrder.id)).toEqual(pendingOwnership);
          expect(await orderTransfers(pendingOrder.id)).toEqual(pendingProof);
        }
      });

      it("releases a partially acquired receipt lock after contention so the same link can be retried", async () => {
        const key = await storeKey();
        const order = await guestOrder();
        const account = await googleAccount(order.email);
        const token = createOrderTrackingToken(order);
        const { result: receipt } = await groupTrackingOrdersFixture(getContainer()).run({ input: {
          customer_id: order.customer_id!, email: order.email, order_ids: [order.id],
        } });
        const locking = getContainer().resolve<ILockingModule>(Modules.LOCKING);
        const blocker = randomUUID();
        const probe = randomUUID();
        await locking.acquire(order.id, { ownerId: blocker, expire: 30 });
        try {
          const blocked = await claim(key, { token }, account.jwt);
          expect(blocked.status).toBe(409);
          expect(await orderOwnership(order.id)).toMatchObject({ customer_id: order.customer_id, email: order.email });
          expect(await orderTransfers(order.id)).toEqual([]);
          // The cart was acquired first; native compensation must release it.
          await locking.acquire(receipt.cart_id, { ownerId: probe, expire: 10 });
          await locking.release(receipt.cart_id, { ownerId: probe });
        } finally {
          await locking.release(order.id, { ownerId: blocker });
        }
        expect((await claim(key, { token }, account.jwt)).status).toBe(200);
        expect(await orderOwnership(order.id)).toMatchObject({ customer_id: account.customer.id, email: order.email });
      });

      it("reflects preparation, shipment and delivery from native fulfillment workflows on the same link", async () => {
        const fixture = await prepareNativeCheckoutFixture(getContainer(), {
          runId: randomUUID(), scenario: "private-order-tracking", inventoryQuantity: 4, productCount: 1,
        });
        const galleryUrl = "https://images.example.invalid/tracking-product.webp";
        await updateProductsWorkflow(getContainer()).run({ input: { products: [{
          id: fixture.products[0].id, thumbnail: null, images: [{ url: galleryUrl }],
        }] } });
        const order = await guestOrder(false, fixture.products[0].variant_id);
        const token = createOrderTrackingToken(order);
        const key = fixture.publishable_key;
        function expectProgress(
          response: Awaited<ReturnType<typeof tracking>>,
          status: StoreOrderTrackingResponse["order"]["fulfillment_status"],
          quantities: NonNullable<StoreOrderTrackingResponse["order"]["items"][number]["detail"]>,
        ) {
          expect(response.status).toBe(200);
          expect(response.data.order.fulfillment_status).toBe(status);
          expect(response.data.order.items[0]).toMatchObject({ quantity: 2, unit_price: 19.99, detail: quantities });
          expect(Object.keys(response.data.order.items[0]).sort()).toEqual([
            "detail", "id", "quantity", "thumbnail", "title", "unit_price", "variant_title",
          ]);
          expect(Object.keys(response.data.order.items[0].detail!).sort()).toEqual([
            "delivered_quantity", "fulfilled_quantity", "shipped_quantity",
          ]);
          const json = JSON.stringify(response.data);
          for (const privateField of ["raw_", "provider_id", "metadata", "delivery_address", "label_url"])
            expect(json).not.toContain(privateField);
        }
        const isoTimestamp = (value: unknown) => value instanceof Date ? value.toISOString() : value;
        async function expectNativeDates(response: Awaited<ReturnType<typeof tracking>>) {
          const { data: persisted } = await query().graph({
            entity: "fulfillment",
            fields: ["id", "created_at", "packed_at", "shipped_at", "delivered_at", "canceled_at"],
            filters: { id: response.data.order.fulfillments.map(package_ => package_.id) },
          }, { cache: { enable: false } });
          expect(persisted).toHaveLength(response.data.order.fulfillments.length);
          for (const package_ of response.data.order.fulfillments) {
            const original = persisted.find(fulfillment_ => fulfillment_.id === package_.id)!;
            expect(package_).toMatchObject({
              created_at: isoTimestamp(original.created_at), packed_at: isoTimestamp(original.packed_at),
              shipped_at: isoTimestamp(original.shipped_at), delivered_at: isoTimestamp(original.delivered_at),
              canceled_at: isoTimestamp(original.canceled_at),
            });
            expect(Object.keys(package_).sort()).toEqual([
              "canceled_at", "created_at", "delivered_at", "id", "labels", "packed_at", "shipped_at",
            ]);
          }
        }
        const initial = await tracking(key, { token });
        expectProgress(initial, "not_fulfilled", { fulfilled_quantity: 0, shipped_quantity: 0, delivered_quantity: 0 });
        expect(initial.data.order.fulfillments).toEqual([]);
        const { data: [persistedOrder] } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "order", fields: ["id", "items.id", "items.detail.quantity"], filters: { id: order.id },
        }, { cache: { enable: false } });
        const items = persistedOrder.items!.map(item => ({ id: item!.id, quantity: Number(item!.detail.quantity) / 2 }));
        const { result: fulfillment } = await createOrderFulfillmentWorkflow(getContainer()).run({ input: {
          order_id: order.id, items, location_id: fixture.vendors[0].location_id,
          shipping_option_id: fixture.vendors[0].shipping_option_id, no_notification: true,
          metadata: { private_provider_note: "Internal fulfillment metadata" },
        } });
        const prepared = await tracking(key, { token });
        expectProgress(prepared, "partially_fulfilled", { fulfilled_quantity: 1, shipped_quantity: 0, delivered_quantity: 0 });
        expect(prepared.data.order.items[0].thumbnail).toBe(galleryUrl);
        expect(prepared.data.order.items[0]).not.toHaveProperty("variant");
        expect(prepared.data.order.fulfillments).toEqual([{
          id: fulfillment.id, created_at: isoTimestamp(fulfillment.created_at), packed_at: isoTimestamp(fulfillment.packed_at),
          shipped_at: null, delivered_at: null, canceled_at: null, labels: [],
        }]);
        expect(prepared.data.order.fulfillments[0].created_at).toEqual(expect.any(String));
        expect(prepared.data.order.fulfillments[0].packed_at).toEqual(expect.any(String));
        await expectNativeDates(prepared);

        const { result: remainingFulfillment } = await createOrderFulfillmentWorkflow(getContainer()).run({ input: {
          order_id: order.id, items, location_id: fixture.vendors[0].location_id,
          shipping_option_id: fixture.vendors[0].shipping_option_id, no_notification: true,
        } });
        const fullyPrepared = await tracking(key, { token });
        expectProgress(fullyPrepared, "fulfilled", { fulfilled_quantity: 2, shipped_quantity: 0, delivered_quantity: 0 });
        await expectNativeDates(fullyPrepared);
        expect(fullyPrepared.data.order.fulfillments.find(package_ => package_.id === remainingFulfillment.id))
          .toMatchObject({ created_at: expect.any(String), packed_at: expect.any(String), shipped_at: null, delivered_at: null });

        await createOrderShipmentWorkflow(getContainer()).run({ input: {
          order_id: order.id, fulfillment_id: fulfillment.id, items, no_notification: true,
          labels: [
            { tracking_number: "QA-TRACK-001", tracking_url: "https://tracking.example.invalid/QA-TRACK-001", label_url: "https://labels.example.invalid/private-label.pdf" },
            { tracking_number: "QA-TRACK-002", tracking_url: "javascript:alert(1)", label_url: "https://labels.example.invalid/private-label-2.pdf" },
          ],
        } });
        const shipped = await tracking(key, { token });
        expectProgress(shipped, "partially_shipped", { fulfilled_quantity: 2, shipped_quantity: 1, delivered_quantity: 0 });
        await expectNativeDates(shipped);
        const shippedPackage = shipped.data.order.fulfillments.find(package_ => package_.id === fulfillment.id)!;
        expect(shippedPackage.shipped_at).toEqual(expect.any(String));
        expect(shippedPackage.labels).toEqual(expect.arrayContaining([
          { tracking_number: "QA-TRACK-001", tracking_url: "https://tracking.example.invalid/QA-TRACK-001" },
          { tracking_number: "QA-TRACK-002", tracking_url: null },
        ]));
        expect(JSON.stringify(shipped.data)).not.toContain("label_url");
        expect(JSON.stringify(shipped.data)).not.toContain("Internal fulfillment metadata");

        await createOrderShipmentWorkflow(getContainer()).run({ input: {
          order_id: order.id, fulfillment_id: remainingFulfillment.id, items, no_notification: true, labels: [],
        } });
        const fullyShipped = await tracking(key, { token });
        expectProgress(fullyShipped, "shipped", { fulfilled_quantity: 2, shipped_quantity: 2, delivered_quantity: 0 });
        await expectNativeDates(fullyShipped);
        for (const package_ of fullyShipped.data.order.fulfillments) {
          expect(package_.shipped_at).toEqual(expect.any(String));
          expect(package_.delivered_at).toBeNull();
        }

        await markOrderFulfillmentAsDeliveredWorkflow(getContainer()).run({ input: {
          orderId: order.id, fulfillmentId: fulfillment.id, no_notification: true,
        } });
        const partialDelivery = await tracking(key, { token });
        expectProgress(partialDelivery, "partially_delivered", { fulfilled_quantity: 2, shipped_quantity: 2, delivered_quantity: 1 });
        await expectNativeDates(partialDelivery);
        expect(partialDelivery.data.order.fulfillments.find(package_ => package_.id === fulfillment.id)!.delivered_at)
          .toEqual(expect.any(String));
        expect(partialDelivery.data.order.fulfillments.find(package_ => package_.id === remainingFulfillment.id)!.delivered_at).toBeNull();
        await markOrderFulfillmentAsDeliveredWorkflow(getContainer()).run({ input: {
          orderId: order.id, fulfillmentId: remainingFulfillment.id, no_notification: true,
        } });
        const delivered = await tracking(key, { token });
        expectProgress(delivered, "delivered", { fulfilled_quantity: 2, shipped_quantity: 2, delivered_quantity: 2 });
        await expectNativeDates(delivered);
        for (const package_ of delivered.data.order.fulfillments)
          expect(package_.delivered_at).toEqual(expect.any(String));
      });
    },
  });
}
