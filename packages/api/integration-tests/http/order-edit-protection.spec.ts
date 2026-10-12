/**
 * Opt in with ORDER_EDIT_PROTECTION_TESTS=disposable-local after loading the
 * isolated test environment. Owns and drops a random localhost database/template.
 * Uses native authentication, RBAC, module steps and links; no mocked HTTP layer,
 * shared actors, payment provider calls or external notifications.
 */
import { randomUUID } from "node:crypto";
import { Client } from "@medusajs/framework/pg";
import type { IAuthModuleService } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  PolicyOperation,
} from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createCartsStep,
  createInventoryItemsStep,
  createInventoryLevelsStep,
  createOrdersStep,
  createPaymentCollectionsStep,
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createRemoteLinkStep,
  createReservationsStep,
  createStockLocations,
  createUsersWorkflow,
} from "@medusajs/core-flows";
import {
  approveSellerWorkflow,
  createCommissionRatesStep,
  createOrderGroupStep,
  createSellerAccountWorkflow,
  upsertCommissionLinesStep,
} from "@mercurjs/core/workflows";
import { CommissionRateType, MercurModules } from "@mercurjs/types";
import type { CommissionRateDTO } from "@mercurjs/types";
import { COMMERCE_AUTOMATION_MODULE } from "../../src/modules/commerce-automation";
import type CommerceAutomationService from "../../src/modules/commerce-automation/service";

type FinancialState = "free" | "reserved" | "review";
type Actor = { prefix: "admin" | "vendor"; token: string; sellerId?: string };

const orderEditTestCreateFinancialStateStep = createStep(
  "order-edit-test-create-financial-state",
  async (
    input: { groupId: string; cartId: string; state: FinancialState },
    { container },
  ) => {
    const service = container.resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE);
    const state = await service.createCommerceGroupStates({
      id: input.groupId,
      cart_id: input.cartId,
      active_token: input.state === "reserved" ? randomUUID() : null,
      review_required: input.state === "review",
      observation: { fixture: "order-edit-protection" },
    });
    return new StepResponse(state, state.id);
  },
  async (id, { container }) => {
    if (id) await container.resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE).deleteCommerceGroupStates(id);
  },
);

const orderEditTestCreateFixtureWorkflow = createWorkflow(
  "order-edit-test-create-fixture",
  function (input: { sellerId: string; otherSellerId: string; state: FinancialState; email: string }) {
    const carts = createCartsStep(transform(input, ({ email }) => [
      { currency_code: "usd", email },
      { currency_code: "usd", email },
    ]));
    const orders = createOrdersStep(transform(input, ({ email }) => [0, 1, 2].map(() => ({
      currency_code: "usd", email,
      items: [{ title: "Disposable order edit item", quantity: 1, unit_price: 100 }],
      shipping_methods: [{ name: "Disposable delivery", amount: 10 }],
    }))));
    const group = createOrderGroupStep({ cart_id: carts[0].id });
    const collections = createPaymentCollectionsStep([{ currency_code: "usd", amount: 220 }]);
    createRemoteLinkStep(transform({ input, carts, orders, group, collections }, ({ input, carts, orders, group, collections }) => [
      ...orders.map((order, index) => ({
        [Modules.ORDER]: { order_id: order.id },
        [Modules.CART]: { cart_id: carts[index === 2 ? 1 : 0].id },
      })),
      ...orders.map((order, index) => ({
        [Modules.ORDER]: { order_id: order.id },
        [MercurModules.SELLER]: { seller_id: index === 1 ? input.otherSellerId : input.sellerId },
      })),
      ...orders.slice(0, 2).map(order => ({
        [MercurModules.SELLER]: { order_group_id: group.id },
        [Modules.ORDER]: { order_id: order.id },
      })),
      { [Modules.CART]: { cart_id: carts[0].id }, [Modules.PAYMENT]: { payment_collection_id: collections[0].id } },
    ]));
    const inventory = createInventoryItemsStep([{ title: "Disposable reserved inventory" }]);
    const locations = createStockLocations([{ name: "Disposable order edit warehouse" }]);
    const levels = createInventoryLevelsStep([{
      inventory_item_id: inventory[0].id,
      location_id: locations[0].id,
      stocked_quantity: 10,
    }]);
    createReservationsStep(transform({ orders, inventory, locations, levels }, ({ orders, inventory, locations }) => orders.slice(0, 2).map(order => ({
      inventory_item_id: inventory[0].id,
      location_id: locations[0].id,
      line_item_id: order.items![0].id,
      quantity: 1,
    }))));
    const commissionRates = transform(createCommissionRatesStep([{
      name: "Disposable order edit commission", code: "disposable-order-edit-commission",
      type: CommissionRateType.PERCENTAGE, value: 10, is_enabled: true,
    }]), (rates: CommissionRateDTO[]) => rates);
    upsertCommissionLinesStep(transform({ orders, commissionRates }, ({ orders, commissionRates }) => ({
      commission_lines: orders.slice(0, 2).map(order => ({
        item_id: order.items![0].id,
        commission_rate_id: commissionRates[0].id,
        code: "disposable-order-edit-commission",
        rate: 10,
        amount: 10,
      })),
    })));
    orderEditTestCreateFinancialStateStep({ groupId: group.id, cartId: carts[0].id, state: input.state });
    return new WorkflowResponse(transform({ orders, carts, group, collections }, ({ orders, carts, group, collections }) => ({
      orderId: orders[0].id,
      siblingOrderId: orders[1].id,
      standaloneOrderId: orders[2].id,
      itemId: orders[0].items![0].id,
      cartId: carts[0].id,
      groupId: group.id,
      collectionId: collections[0].id,
    })));
  },
);

if (process.env.ORDER_EDIT_PROTECTION_TESTS !== "disposable-local") {
  describe.skip("native order-edit protection (requires disposable-local opt-in)", () => {
    it("requires isolated PostgreSQL and Redis", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
    !process.env.DB_PORT || !process.env.DB_USERNAME || !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" || process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error("Use dedicated localhost PostgreSQL with TLS; this suite owns its database names.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || !redis.username ||
    !redis.password || !/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)) {
    throw new Error("Use dedicated localhost TLS Redis with credentials and a nonzero database.");
  }
  for (const name of ["STRIPE_API_KEY", "RESEND_API_KEY", "ALGOLIA_API_KEY", "SUPABASE_S3_ACCESS_KEY_ID"]) {
    if (process.env[name]?.trim()) throw new Error("External providers must be disabled for order-edit tests.");
  }
  const dbName = `closure_edit_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async container => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        if (new URL(config.projectConfig.databaseUrl!).pathname !== `/${dbName}`) {
          throw new Error("Application database differs from this disposable runner's database.");
        }
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) =>
            typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Use only local/mock notification providers in disposable order-edit tests.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const request = (actor: Actor, method: "POST" | "DELETE", route: string, body?: object) => api.request({
        method, url: `/${actor.prefix}${route}`, data: body,
        headers: { authorization: `Bearer ${actor.token}`, ...(actor.sellerId ? { "x-seller-id": actor.sellerId } : {}) },
        validateStatus: () => true,
      });
      async function identity() {
        const email = `order-edit-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registration = await auth().register("emailpass", { body: { email, password } });
        if (!registration.success || !registration.authIdentity) throw new Error("Native fixture identity registration failed.");
        const id = registration.authIdentity.id;
        const verification = await auth().requestAuthVerification({ auth_identity_id: id, entity_id: email, entity_type: "email", code_provider: "token" });
        if (!verification.code) throw new Error("Native fixture verification code is missing.");
        await auth().confirmAuthVerification({ code: verification.code, auth_identity_id: id });
        return { id, email, password };
      }
      async function login(actor: "user" | "member", account: Awaited<ReturnType<typeof identity>>) {
        const response = await api.post(`/auth/${actor}/emailpass`, { email: account.email, password: account.password });
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token as string;
      }
      async function admin(readOnly = false): Promise<Actor> {
        const account = await identity();
        const operations = readOnly ? [PolicyOperation.read] : [PolicyOperation.read, PolicyOperation.create, PolicyOperation.update, PolicyOperation.delete];
        const rbac = getContainer().resolve(Modules.RBAC);
        const policyIds: string[] = [];
        for (const resource of ["order", "order_change"]) {
          for (const operation of operations) {
            const existing = await rbac.listRbacPolicies({ resource, operation });
            if (existing.length) policyIds.push(...existing.map(policy => policy.id));
            else {
              const { result } = await createRbacPoliciesWorkflow(getContainer()).run({ input: { policies: [{ key: `${resource}:${operation}`, resource, operation }] } });
              policyIds.push(...result.map(policy => policy.id));
            }
          }
        }
        const { result: roles } = await createRbacRolesWorkflow(getContainer()).run({ input: {
          roles: [{ name: `order-edit-${randomUUID()}`, policy_ids: policyIds }],
        } });
        const { result: users } = await createUsersWorkflow(getContainer()).run({ input: { users: [{ email: account.email, roles: [roles[0].id] }] } });
        await auth().updateAuthIdentities({ id: account.id, app_metadata: { user_id: users[0].id } });
        return { prefix: "admin", token: await login("user", account) };
      }
      async function vendor(): Promise<Actor & { sellerId: string }> {
        const account = await identity();
        const { result: seller } = await createSellerAccountWorkflow(getContainer()).run({ input: {
          auth_identity_id: account.id, member_email: account.email,
          seller: { name: `Disposable seller ${randomUUID()}`, handle: `order-edit-${randomUUID()}`, email: account.email, currency_code: "usd" },
        } });
        await approveSellerWorkflow(getContainer()).run({ input: { seller_id: seller.id } });
        return { prefix: "vendor", sellerId: seller.id, token: await login("member", account) };
      }
      async function fixture(state: FinancialState) {
        const operator = await admin();
        const owner = await vendor();
        const other = await vendor();
        const { result } = await orderEditTestCreateFixtureWorkflow(getContainer()).run({ input: {
          sellerId: owner.sellerId, otherSellerId: other.sellerId, state,
          email: `order-edit-buyer-${randomUUID()}@example.invalid`,
        } });
        const { data: groups } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "order_group", fields: ["id", "cart_id", "orders.id"], filters: { id: result.groupId },
        }, { cache: { enable: false } });
        expect(groups[0].cart_id).toBe(result.cartId);
        expect(groups[0].orders?.flatMap(order => order ? [order.id] : []).sort()).toEqual([result.orderId, result.siblingOrderId].sort());
        return { ...result, operator, owner, other };
      }
      async function persistedState() {
        const client = new Client({ host: "localhost", port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: dbName });
        await client.connect();
        try {
          const tables = ["order", "order_item", "order_line_item", "order_change", "order_change_action", "order_shipping_method", "order_summary", "payment_collection", "reservation_item", "inventory_level", "commission_line", "commerce_group_state", "commerce_operation"];
          const snapshot: Record<string, unknown[]> = {};
          for (const table of tables) {
            snapshot[table] = (await client.query(`SELECT row_to_json(record) AS row FROM "${table}" record ORDER BY id`)).rows.map((record: { row: unknown }) => record.row);
          }
          return snapshot;
        } finally { await client.end(); }
      }
      function mutations(orderId: string, itemId: string) {
        const base = `/order-edits/${orderId}`;
        return [
          { method: "POST", route: "/order-edits", body: { order_id: orderId } },
          { method: "DELETE", route: base },
          { method: "POST", route: `${base}/request` },
          { method: "POST", route: `${base}/confirm` },
          { method: "POST", route: `${base}/items`, body: { items: [{ variant_id: "variant_disposable_guard_probe", quantity: 2 }] } },
          { method: "POST", route: `${base}/items/action_disposable_guard_probe`, body: { quantity: 2 } },
          { method: "DELETE", route: `${base}/items/action_disposable_guard_probe` },
          { method: "POST", route: `${base}/items/item/${itemId}`, body: { quantity: 2 } },
          { method: "POST", route: `${base}/shipping-method`, body: { shipping_option_id: "so_disposable_guard_probe", custom_amount: 1 } },
          { method: "POST", route: `${base}/shipping-method/action_disposable_guard_probe`, body: { custom_amount: 1 } },
          { method: "DELETE", route: `${base}/shipping-method/action_disposable_guard_probe` },
        ] satisfies { method: "POST" | "DELETE"; route: string; body?: object }[];
      }

      it.each<FinancialState>(["free", "reserved", "review"])(
        "blocks all native admin/vendor order edits with a %s financial group and preserves persisted amounts, inventory and journal",
        async state => {
          const test = await fixture(state);
          const before = await persistedState();
          expect(before.reservation_item).toHaveLength(2);
          expect(before.commission_line).toHaveLength(2);
          expect(before.payment_collection).toHaveLength(1);
          for (const actor of [test.operator, test.owner]) {
            for (const mutation of mutations(test.orderId, test.itemId)) {
              const response = await request(actor, mutation.method, mutation.route, mutation.body);
              expect({ route: `${mutation.method} /${actor.prefix}${mutation.route}`, status: response.status, data: response.data }).toEqual({
                route: `${mutation.method} /${actor.prefix}${mutation.route}`,
                status: 400,
                data: { type: "not_allowed", message: "La edición de pedidos del marketplace no está habilitada." },
              });
            }
          }
          expect(await persistedState()).toEqual(before);
        },
      );

      it("preserves native authentication, admin permissions and seller ownership", async () => {
        const test = await fixture("free");
        const reader = await admin(true);
        const before = await persistedState();
        for (const prefix of ["admin", "vendor"]) {
          const response = await api.post(`/${prefix}/order-edits`, { order_id: test.orderId }, { validateStatus: () => true });
          expect(response.status).toBe(401);
        }
        // The marketplace prohibition runs after authentication, before the
        // route's RBAC/ownership checks. No-group orders exercise those native gates.
        for (const actor of [reader, test.other]) {
          const response = await request(actor, "POST", "/order-edits", { order_id: test.orderId });
          expect(response.status).toBe(400);
          expect(response.data.type).toBe("not_allowed");
        }
        expect((await request(reader, "POST", "/order-edits", { order_id: test.standaloneOrderId })).status).toBe(403);
        expect((await request(test.other, "POST", "/order-edits", { order_id: test.standaloneOrderId })).status).toBe(404);
        expect((await request(test.other, "DELETE", `/order-edits/${test.standaloneOrderId}`)).status).toBe(404);
        expect(await persistedState()).toEqual(before);
      });

      it.each(["admin", "vendor"] as const)("keeps native %s creation and cancellation available for an order without a marketplace group", async prefix => {
        const test = await fixture("free");
        const actor = prefix === "admin" ? test.operator : test.owner;
        const created = await request(actor, "POST", "/order-edits", { order_id: test.standaloneOrderId });
        expect(created.status).toBe(200);
        expect(created.data.order_change).toMatchObject({ order_id: test.standaloneOrderId, change_type: "edit" });
        const canceled = await request(actor, "DELETE", `/order-edits/${test.standaloneOrderId}`);
        expect(canceled.status).toBe(200);
        expect(canceled.data).toMatchObject({ id: test.standaloneOrderId, object: "order-edit", deleted: true });
      });
    },
  });
}
