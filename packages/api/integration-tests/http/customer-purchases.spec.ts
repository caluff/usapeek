/**
 * Real native workflows and HTTP; opt in with
 * CUSTOMER_PURCHASES_TESTS=disposable-local on exclusive localhost
 * PostgreSQL:55432 and TLS Redis:56379/15. Only the runner's random database
 * and template are created/dropped. External providers must remain disabled.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { discoveryPath } from "@medusajs/medusa/order";
import type {
  CreateCustomerDTO,
  CreateOrderDTO,
  CreateOrderTransactionDTO,
  IAuthModuleService,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  OrderStatus,
  PolicyOperation,
} from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  addOrderTransactionStep,
  beginOrderEditOrderWorkflow,
  cancelOrdersStep,
  confirmOrderEditRequestWorkflow,
  createCartsStep,
  createCustomersWorkflow,
  createOrdersStep,
  createPaymentCollectionsStep,
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createRemoteLinkStep,
  createUsersWorkflow,
  deleteCustomersWorkflow,
  orderEditUpdateItemQuantityWorkflow,
  requestOrderEditRequestWorkflow,
  updateOrdersStep,
} from "@medusajs/core-flows";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createOrderGroupStep,
  createSellerAccountWorkflow,
  createSellersStep,
} from "@mercurjs/core/workflows";
import type SellerModule from "@mercurjs/core/modules/seller";
import { MercurModules } from "@mercurjs/types";
import type {
  AdminCustomerPurchasesDetailResponse,
  AdminCustomerPurchasesResponse,
} from "../../src/lib/customer-purchases/contracts";

type NativeSellerModuleService = InstanceType<typeof SellerModule.service>;

if (process.env.CUSTOMER_PURCHASES_TESTS !== "disposable-local") {
  describe.skip("customer purchases (requires disposable-local opt-in)", () => {
    it("requires exclusive disposable PostgreSQL and TLS Redis", () => {});
  });
} else {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  ) {
    throw new Error(
      "Customer purchase tests require disposable localhost PostgreSQL with TLS.",
    );
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (
    redis.protocol !== "rediss:" ||
    redis.hostname !== "localhost" ||
    redis.port !== "56379" ||
    redis.username !== "closure" ||
    !redis.password ||
    redis.pathname !== "/15"
  ) {
    throw new Error(
      "Customer purchase tests require exclusive localhost TLS Redis DB15.",
    );
  }
  for (const name of [
    "STRIPE_API_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PAYOUT_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "ALGOLIA_API_KEY",
    "SUPABASE_S3_ACCESS_KEY_ID",
    "GOOGLE_CLIENT_SECRET",
  ]) {
    if (process.env[name]?.trim()) {
      throw new Error(
        "External providers must be disabled for customer purchase tests.",
      );
    }
  }
  const dbName = `customer_purchases_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL =
    `postgres://closure_test:${encodeURIComponent(process.env.DB_PASSWORD)}` +
    `@localhost:55432/${dbName}`;
  jest.setTimeout(180_000);

  const createPurchaseFixtureWorkflow = createWorkflow(
    "customer-purchases-test-create-purchase",
    function (input: { customer_id: string | null }) {
      const carts = createCartsStep([{ currency_code: "usd" }]);
      const group = createOrderGroupStep({
        cart_id: carts[0].id,
        customer_id: input.customer_id,
      });
      return new WorkflowResponse(group);
    },
  );

  const createSplitPurchaseFixtureWorkflow = createWorkflow(
    "customer-purchases-test-create-split-purchase",
    function (input: {
      customer_id: string;
      email: string;
      namespace: string;
    }) {
      const carts = createCartsStep([
        {
          currency_code: "usd",
          customer_id: input.customer_id,
          email: input.email,
        },
      ]);
      const group = createOrderGroupStep({
        cart_id: carts[0].id,
        customer_id: input.customer_id,
      });
      const sellers = createSellersStep(
        transform(input, ({ namespace }) =>
          [0, 1].map((index) => ({
            name: `${namespace} seller ${index}`,
            handle: `${namespace.toLowerCase()}-${index}`,
            email: `${namespace.toLowerCase()}-${index}@example.invalid`,
            currency_code: "usd",
          })),
        ),
      );
      const createdOrders = createOrdersStep(
        transform(input, ({ customer_id, email }) =>
          [0, 1].map((index) => ({
            currency_code: "usd",
            customer_id,
            email,
            metadata: { customer_purchases_fixture_index: index },
            items: [
              {
                title: `Disposable seller item ${index}`,
                quantity: 1,
                unit_price: 20,
              },
            ],
          })),
        ),
      );
      const orders = transform(createdOrders, (created) =>
        [...created].sort(
          (first, second) =>
            Number(first.metadata?.customer_purchases_fixture_index) -
            Number(second.metadata?.customer_purchases_fixture_index),
        ),
      );
      createRemoteLinkStep(
        transform(
          { carts, group, sellers, orders },
          ({ carts, group, sellers, orders }) => [
            ...orders.map((order) => ({
              [MercurModules.SELLER]: { order_group_id: group.id },
              [Modules.ORDER]: { order_id: order.id },
            })),
            ...orders.map((order, index) => ({
              [Modules.ORDER]: { order_id: order.id },
              [MercurModules.SELLER]: { seller_id: sellers[index].id },
            })),
            ...orders.map((order) => ({
              [Modules.ORDER]: { order_id: order.id },
              [Modules.CART]: { cart_id: carts[0].id },
            })),
          ],
        ),
      );
      return new WorkflowResponse(
        transform({ group, orders }, ({ group, orders }) => ({
          group_id: group.id,
          order_ids: orders.map((order) => order.id),
        })),
      );
    },
  );

  const softDeletePurchaseFixtureStep = createStep(
    "customer-purchases-test-soft-delete-groups",
    async (ids: string[], { container }) => {
      await container
        .resolve<NativeSellerModuleService>(MercurModules.SELLER)
        .softDeleteOrderGroups(ids);
      return new StepResponse(ids, ids);
    },
    async (ids, { container }) => {
      if (ids?.length) {
        await container
          .resolve<NativeSellerModuleService>(MercurModules.SELLER)
          .restoreOrderGroups(ids);
      }
    },
  );
  const softDeletePurchaseFixtureWorkflow = createWorkflow(
    "customer-purchases-test-soft-delete-purchases",
    function (input: string[]) {
      return new WorkflowResponse(softDeletePurchaseFixtureStep(input));
    },
  );

  const createOrderFixtureWorkflow = createWorkflow(
    "customer-purchases-test-create-orders",
    function (input: CreateOrderDTO[]) {
      return new WorkflowResponse(createOrdersStep(input));
    },
  );
  const transactOrderFixtureWorkflow = createWorkflow(
    "customer-purchases-test-order-transactions",
    function (input: CreateOrderTransactionDTO[]) {
      return new WorkflowResponse(addOrderTransactionStep(input));
    },
  );
  const updateOrderFixtureWorkflow = createWorkflow(
    "customer-purchases-test-update-order",
    function (input: {
      id: string;
      update: { status?: OrderStatus; is_draft_order?: boolean };
    }) {
      return new WorkflowResponse(
        updateOrdersStep({ selector: { id: input.id }, update: input.update }),
      );
    },
  );
  const cancelOrderFixtureWorkflow = createWorkflow(
    "customer-purchases-test-cancel-orders",
    function (input: string[]) {
      return new WorkflowResponse(cancelOrdersStep({ orderIds: input }));
    },
  );
  const createPaymentCollectionFixtureWorkflow = createWorkflow(
    "customer-purchases-test-link-payment-collection",
    function (input: { order_id: string; amount: number }) {
      const collections = createPaymentCollectionsStep([
        { currency_code: "usd", amount: input.amount },
      ]);
      createRemoteLinkStep([
        {
          [Modules.ORDER]: { order_id: input.order_id },
          [Modules.PAYMENT]: { payment_collection_id: collections[0].id },
        },
      ]);
      return new WorkflowResponse(collections[0]);
    },
  );

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        const database = new URL(config.projectConfig.databaseUrl!);
        if (
          database.hostname !== "localhost" ||
          database.port !== "55432" ||
          database.pathname !== `/${dbName}` ||
          config.projectConfig.redisUrl !== process.env.REDIS_URL
        ) {
          throw new Error(
            "Refusing customer purchase tests against another database or Redis.",
          );
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      let operatorToken: string;
      let namespace: string;

      function assertNativeModuleResources() {
        const requireNativeOrder = createRequire(discoveryPath);
        const nativeService = requireNativeOrder("./services").OrderService;
        const nativeRepository =
          requireNativeOrder("./repositories").OrderRepository;
        const service = getContainer().resolve(Modules.ORDER) as unknown as {
          orderService_: {
            constructor: { name: string };
            orderRepository_: {
              constructor: { name: string };
              find: unknown;
            };
          };
        };
        const repository = service.orderService_.orderRepository_;
        // Medusa proxies every function read, including constructor and find.
        // Compare the actual injected prototype rather than its proxy wrappers.
        const repositoryPrototype = Object.getPrototypeOf(repository) as {
          find: unknown;
        };
        const requireNativeSeller = createRequire(
          createRequire(__filename).resolve("@mercurjs/core/modules/seller"),
        );
        const nativeGroupRepository =
          requireNativeSeller("./repositories").OrderGroupRepository;
        const seller = getContainer().resolve(
          MercurModules.SELLER,
        ) as unknown as {
          orderGroupRepository_: {
            constructor: { name: string };
            findAndCount: unknown;
          };
        };
        const groupPrototype = Object.getPrototypeOf(
          seller.orderGroupRepository_,
        ) as { findAndCount: unknown };
        expect({
          nativeOrderService:
            service.orderService_.constructor === nativeService,
          nativeOrderRepository:
            repositoryPrototype === nativeRepository.prototype,
          nativeOrderFind:
            repositoryPrototype.find === nativeRepository.prototype.find,
          nativeGroupRepository:
            groupPrototype === nativeGroupRepository.prototype,
          nativeGroupFindAndCount:
            groupPrototype.findAndCount ===
            nativeGroupRepository.prototype.findAndCount,
        }).toEqual({
          nativeOrderService: true,
          nativeOrderRepository: true,
          nativeOrderFind: true,
          nativeGroupRepository: true,
          nativeGroupFindAndCount: true,
        });
      }

      const request = async (
        params: object = {},
        token: string | undefined = operatorToken,
      ): Promise<{
        status: number;
        data: AdminCustomerPurchasesResponse;
        headers: Record<string, string>;
      }> => {
        const response = await api.get("/admin/customer-purchases", {
          params,
          headers: token ? { authorization: `Bearer ${token}` } : {},
          validateStatus: () => true,
        });
        return {
          status: response.status,
          data: response.data as AdminCustomerPurchasesResponse,
          headers: response.headers,
        };
      };

      const detail = async (
        customerId: string,
        params: object = {},
        token: string | undefined = operatorToken,
      ): Promise<{
        status: number;
        data: AdminCustomerPurchasesDetailResponse;
      }> => {
        const response = await api.get(
          `/admin/customer-purchases/${customerId}`,
          {
            params,
            headers: token ? { authorization: `Bearer ${token}` } : {},
            validateStatus: () => true,
          },
        );
        return {
          status: response.status,
          data: response.data as AdminCustomerPurchasesDetailResponse,
        };
      };

      async function customers(input: CreateCustomerDTO[]) {
        const { result } = await createCustomersWorkflow(getContainer()).run({
          input: { customersData: input },
        });
        return result;
      }

      async function purchase(customerId: string | null) {
        const { result } = await createPurchaseFixtureWorkflow(
          getContainer(),
        ).run({
          input: { customer_id: customerId },
        });
        return result;
      }

      async function orders(
        customerId: string,
        input: Array<Omit<CreateOrderDTO, "customer_id">>,
      ) {
        const keyedInputs = input.map((order) => ({
          currency_code: "usd",
          ...order,
          customer_id: customerId,
          metadata: {
            ...order.metadata,
            customer_purchases_fixture_key: randomUUID(),
          },
        }));
        const { result } = await createOrderFixtureWorkflow(getContainer()).run(
          {
            input: keyedInputs,
          },
        );
        // Native createOrders reads back by ID, so its result order may differ.
        const byFixtureKey = new Map(
          result.map((order) => [
            order.metadata?.customer_purchases_fixture_key,
            order,
          ]),
        );
        return keyedInputs.map((inputOrder) => {
          const order = byFixtureKey.get(
            inputOrder.metadata.customer_purchases_fixture_key,
          );
          if (!order) throw new Error("Native fixture order is missing.");
          return order;
        });
      }

      async function transactions(
        orderId: string,
        currencyCode: string,
        amounts: number[],
      ) {
        await transactOrderFixtureWorkflow(getContainer()).run({
          input: amounts.map((amount) => ({
            order_id: orderId,
            currency_code: currencyCode,
            amount,
            reference: amount > 0 ? "capture" : "refund",
            reference_id: `disposable-${randomUUID()}`,
          })),
        });
      }

      async function identity() {
        const auth = getContainer().resolve<IAuthModuleService>(Modules.AUTH);
        const email = `purchases-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registration = await auth.register("emailpass", {
          body: { email, password },
        });
        if (!registration.success || !registration.authIdentity) {
          throw new Error("Native purchase identity registration failed.");
        }
        const id = registration.authIdentity.id;
        const verification = await auth.requestAuthVerification({
          auth_identity_id: id,
          entity_id: email,
          entity_type: "email",
          code_provider: "token",
        });
        if (!verification.code)
          throw new Error("Purchase verification code missing.");
        await auth.confirmAuthVerification({
          code: verification.code,
          auth_identity_id: id,
        });
        return { id, email, password };
      }

      async function login(
        actor: "user" | "customer" | "member",
        account: Awaited<ReturnType<typeof identity>>,
      ) {
        const response = await api.post(`/auth/${actor}/emailpass`, {
          email: account.email,
          password: account.password,
        });
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token as string;
      }

      async function operator(resources: string[]) {
        const account = await identity();
        const rbac = getContainer().resolve(Modules.RBAC);
        const policyIds: string[] = [];
        for (const resource of resources) {
          let policies = await rbac.listRbacPolicies({
            resource,
            operation: PolicyOperation.read,
          });
          if (!policies.length) {
            ({ result: policies } = await createRbacPoliciesWorkflow(
              getContainer(),
            ).run({
              input: {
                policies: [{ key: `${resource}:${PolicyOperation.read}`, resource, operation: PolicyOperation.read }],
              },
            }));
          }
          policyIds.push(...policies.map((policy) => policy.id));
        }
        const { result: roles } = await createRbacRolesWorkflow(
          getContainer(),
        ).run({
          input: {
            roles: [
              { name: `${namespace}-${randomUUID()}`, policy_ids: policyIds },
            ],
          },
        });
        const { result: users } = await createUsersWorkflow(getContainer()).run(
          {
            input: { users: [{ email: account.email, roles: [roles[0].id] }] },
          },
        );
        await getContainer()
          .resolve<IAuthModuleService>(Modules.AUTH)
          .updateAuthIdentities({
            id: account.id,
            app_metadata: { user_id: users[0].id },
          });
        return login("user", account);
      }

      beforeEach(async () => {
        assertNativeModuleResources();
        namespace = `PURCHASES${randomUUID().replaceAll("-", "")}`;
        operatorToken = await operator(["customer", "order_group", "order"]);
      });

      it("counts checkout groups once and keeps account and guest IDs separate for the same email", async () => {
        const email = `${namespace.toLowerCase()}@example.invalid`;
        const [account, guest, withoutPurchases] = await customers([
          {
            email,
            has_account: true,
            first_name: "Account",
            last_name: "Buyer",
            phone: "+13035550110",
          },
          { email, has_account: false },
          {
            email: `unused-${email}`,
            has_account: true,
            first_name: "No purchases",
          },
        ]);
        const { result: split } = await createSplitPurchaseFixtureWorkflow(
          getContainer(),
        ).run({
          input: { customer_id: account.id, email, namespace },
        });
        expect(split.order_ids).toHaveLength(2);
        expect(new Set(split.order_ids).size).toBe(2);
        const splitOnly = await request();
        expect(splitOnly.status).toBe(200);
        expect(splitOnly.data.count).toBe(1);
        expect(splitOnly.data.customers).toHaveLength(1);
        expect(splitOnly.data.customers[0]).toMatchObject({
          id: account.id,
          purchase_count: 1,
        });
        await purchase(account.id);
        await purchase(guest.id);

        const startedAt = performance.now();
        const response = await request();
        console.info(
          `Customer purchases HTTP: ${Math.round(performance.now() - startedAt)} ms`,
        );
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.data).toEqual({
          customers: [
            {
              id: account.id,
              first_name: "Account",
              last_name: "Buyer",
              email,
              phone: "+13035550110",
              has_account: true,
              purchase_count: 2,
              spent_totals: [],
              is_deleted: false,
            },
            {
              id: guest.id,
              first_name: null,
              last_name: null,
              email,
              phone: null,
              has_account: false,
              purchase_count: 1,
              spent_totals: [],
              is_deleted: false,
            },
          ],
          count: 2,
          limit: 10,
          offset: 0,
        });
        expect(
          response.data.customers.some(
            (customer: { id: string }) => customer.id === withoutPurchases.id,
          ),
        ).toBe(false);
      });

      it("sums native net captures once across seller orders and current versions, separating currencies and excluding drafts and canceled orders", async () => {
        const [buyer] = await customers([
          {
            email: `${namespace.toLowerCase()}@example.invalid`,
            has_account: true,
          },
        ]);
        const { result: split } = await createSplitPurchaseFixtureWorkflow(
          getContainer(),
        ).run({
          input: { customer_id: buyer.id, email: buyer.email!, namespace },
        });
        await transactions(split.order_ids[0], "usd", [100, -25]);
        await transactions(split.order_ids[1], "usd", [40]);
        const [
          eur,
          refunded,
          versioned,
          draft,
          draftFlag,
          canceled,
          cancellationTimestamp,
          unpaid,
          overRefunded,
        ] = await orders(buyer.id, [
          {
            currency_code: "eur",
            items: [{ title: "EUR item", quantity: 1, unit_price: 19.5 }],
          },
          {
            currency_code: "gbp",
            items: [{ title: "Fully refunded", quantity: 1, unit_price: 12 }],
          },
          { items: [{ title: "Edited item", quantity: 1, unit_price: 20 }] },
          { status: OrderStatus.DRAFT },
          {},
          {},
          {},
          {
            currency_code: "cad",
            items: [{ title: "Awaiting payment", quantity: 1, unit_price: 10 }],
          },
          { items: [{ title: "Over refunded", quantity: 1, unit_price: 20 }] },
        ]);
        await transactions(eur.id, "eur", [19.5]);
        await transactions(refunded.id, "gbp", [12, -12]);
        await createPaymentCollectionFixtureWorkflow(getContainer()).run({
          input: { order_id: versioned.id, amount: 20 },
        });
        await transactions(versioned.id, "usd", [20]);
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const { data: beforeEdit } = await query.graph(
          {
            entity: "order",
            fields: ["id", "summary", "total", "currency_code", "region_id"],
            filters: { id: versioned.id },
          },
          { cache: { enable: false } },
        );
        expect(Number(beforeEdit[0].summary?.transaction_total)).toBe(20);
        await beginOrderEditOrderWorkflow(getContainer()).run({
          input: { order_id: versioned.id },
        });
        await orderEditUpdateItemQuantityWorkflow(getContainer()).run({
          input: {
            order_id: versioned.id,
            items: [{ id: versioned.items![0].id, quantity: 2 }],
          },
        });
        await requestOrderEditRequestWorkflow(getContainer()).run({
          input: { order_id: versioned.id },
        });
        await confirmOrderEditRequestWorkflow(getContainer()).run({
          input: { order_id: versioned.id },
        });
        await transactions(versioned.id, "usd", [-5]);
        const { data: current } = await query.graph({
          entity: "order",
          fields: ["id", "version", "summary"],
          filters: { id: versioned.id },
        });
        expect(current[0].version).toBe(2);
        expect(Number(current[0].summary?.transaction_total)).toBe(15);
        for (const excluded of [
          draft,
          draftFlag,
          canceled,
          cancellationTimestamp,
        ])
          await transactions(excluded.id, "usd", [999]);
        await updateOrderFixtureWorkflow(getContainer()).run({
          input: { id: draftFlag.id, update: { is_draft_order: true } },
        });
        await cancelOrderFixtureWorkflow(getContainer()).run({
          input: [canceled.id, cancellationTimestamp.id],
        });
        await updateOrderFixtureWorkflow(getContainer()).run({
          input: {
            id: cancellationTimestamp.id,
            update: { status: OrderStatus.PENDING },
          },
        });
        await transactions(overRefunded.id, "usd", [20, -25]);
        const { data: waiting } = await query.graph({
          entity: "order",
          fields: ["id", "summary"],
          filters: { id: unpaid.id },
        });
        expect(Number(waiting[0].summary?.paid_total)).toBe(0);

        const response = await request();
        expect(response.status).toBe(200);
        expect(response.data.customers).toHaveLength(1);
        expect(response.data.customers[0]).toMatchObject({
          id: buyer.id,
          purchase_count: 1,
          spent_totals: [
            { currency_code: "eur", amount: 19.5 },
            { currency_code: "gbp", amount: 0 },
            { currency_code: "usd", amount: 130 },
          ],
        });
        const editedDetail = await detail(buyer.id, { limit: 100 });
        expect(editedDetail.status).toBe(200);
        expect(
          editedDetail.data.orders.find((order) => order.id === versioned.id),
        ).toMatchObject({
          total: 40,
          items: [{ title: "Edited item", quantity: 2 }],
        });
      });

      it("paginates ten buyers with stable count and deterministic ordering, including beyond the last page", async () => {
        const buyers = await customers(
          Array.from({ length: 13 }, (_, index) => ({
            email: `${namespace.toLowerCase()}-${index}@example.invalid`,
            has_account: index % 2 === 0,
            first_name: `Buyer ${index}`,
          })),
        );
        for (const buyer of buyers) await purchase(buyer.id);
        await purchase(buyers[6].id);
        const expected = [
          buyers[6].id,
          ...buyers
            .filter((buyer) => buyer.id !== buyers[6].id)
            .map((buyer) => buyer.id)
            .sort(),
        ];

        const first = await request();
        expect(first.status).toBe(200);
        expect(first.data).toMatchObject({ count: 13, limit: 10, offset: 0 });
        expect(
          first.data.customers.map((buyer: { id: string }) => buyer.id),
        ).toEqual(expected.slice(0, 10));
        expect(first.data.customers[0].purchase_count).toBe(2);
        expect((await request()).data.customers).toEqual(first.data.customers);

        const second = await request({ limit: 10, offset: 10 });
        expect(second.status).toBe(200);
        expect(second.data).toMatchObject({ count: 13, limit: 10, offset: 10 });
        expect(
          second.data.customers.map((buyer: { id: string }) => buyer.id),
        ).toEqual(expected.slice(10));
        expect(
          new Set(
            [...first.data.customers, ...second.data.customers].map(
              (buyer: { id: string }) => buyer.id,
            ),
          ).size,
        ).toBe(13);
        const beyond = await request({ limit: 10, offset: 30 });
        expect(beyond.status).toBe(200);
        expect(beyond.data).toEqual({
          customers: [],
          count: 13,
          limit: 10,
          offset: 30,
        });
      });

      it("keeps deleted customers anonymous without dropping their counts and excludes null customers and deleted groups", async () => {
        const [guest, removedCustomer, onlyRemovedPurchase] = await customers([
          {
            email: `guest-${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
          },
          {
            email: `removed-${namespace.toLowerCase()}@example.invalid`,
            has_account: true,
            first_name: "Removed",
            last_name: "Personal data",
            phone: "+13035550111",
          },
          {
            email: `unused-${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
          },
        ]);
        await purchase(guest.id);
        const deletedGuestPurchase = await purchase(guest.id);
        await purchase(removedCustomer.id);
        const onlyDeleted = await purchase(onlyRemovedPurchase.id);
        await purchase(null);
        const missingCustomerId = `cus_missing_${randomUUID().replaceAll("-", "")}`;
        await purchase(missingCustomerId);
        await softDeletePurchaseFixtureWorkflow(getContainer()).run({
          input: [deletedGuestPurchase.id, onlyDeleted.id],
        });
        await deleteCustomersWorkflow(getContainer()).run({
          input: { ids: [removedCustomer.id] },
        });

        const response = await request();
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject({ count: 3, limit: 10, offset: 0 });
        expect(response.data.customers).toEqual(
          [
            {
              id: guest.id,
              first_name: null,
              last_name: null,
              email: guest.email,
              phone: null,
              has_account: false,
              purchase_count: 1,
              spent_totals: [],
              is_deleted: false,
            },
            {
              id: removedCustomer.id,
              first_name: null,
              last_name: null,
              email: null,
              phone: null,
              has_account: null,
              purchase_count: 1,
              spent_totals: [],
              is_deleted: true,
            },
            {
              id: missingCustomerId,
              first_name: null,
              last_name: null,
              email: null,
              phone: null,
              has_account: null,
              purchase_count: 1,
              spent_totals: [],
              is_deleted: true,
            },
          ].sort((left, right) => left.id.localeCompare(right.id)),
        );
        expect((await detail(removedCustomer.id)).status).toBe(404);
        expect((await detail(missingCustomerId)).status).toBe(404);
        expect((await detail(onlyRemovedPurchase.id)).status).toBe(404);
      });

      it("shows the active buyer's contact data and paginates native orders without drafts or other buyers", async () => {
        const savedAddress = {
          address_1: "120 Saved Avenue",
          address_2: "Apartment 2",
          city: "Miami",
          province: "fl",
          postal_code: "33101",
          country_code: "us",
        };
        const [buyer, other, noPurchases] = await customers([
          {
            email: `${namespace.toLowerCase()}@example.invalid`,
            has_account: true,
            first_name: "Maria",
            last_name: "Buyer",
            phone: "+13035550110",
            addresses: [
              {
                ...savedAddress,
                is_default_shipping: true,
                phone: "+13035550999",
              },
            ],
          },
          {
            email: `other-${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
          },
          {
            email: `unused-${namespace.toLowerCase()}@example.invalid`,
            has_account: true,
          },
        ]);
        const { result: split } = await createSplitPurchaseFixtureWorkflow(
          getContainer(),
        ).run({
          input: { customer_id: buyer.id, email: buyer.email!, namespace },
        });
        const history = await orders(
          buyer.id,
          Array.from({ length: 10 }, (_, index) => ({
            items: [
              {
                title: `Historic product ${index}`,
                variant_title: "Large",
                quantity: 1,
                unit_price: 30 + index,
              },
            ],
          })),
        );
        const [draft, draftFlag] = await orders(buyer.id, [
          { status: OrderStatus.DRAFT },
          {},
        ]);
        expect(draft.status).toBe(OrderStatus.DRAFT);
        await updateOrderFixtureWorkflow(getContainer()).run({
          input: { id: draftFlag.id, update: { is_draft_order: true } },
        });
        await cancelOrderFixtureWorkflow(getContainer()).run({
          input: [history[0].id],
        });
        const [otherOrder] = await orders(other.id, [
          { items: [{ title: "Other buyer", quantity: 1, unit_price: 500 }] },
        ]);
        await purchase(other.id);

        const first = await detail(buyer.id);
        expect(first.status).toBe(200);
        expect(first.data).toMatchObject({ count: 12, limit: 10, offset: 0 });
        expect(first.data.customer).toEqual({
          id: buyer.id,
          first_name: "Maria",
          last_name: "Buyer",
          email: buyer.email,
          has_account: true,
          phone: "+13035550110",
          addresses: [savedAddress],
          purchase_count: 1,
          spent_totals: [],
        });
        expect(first.data.orders).toHaveLength(10);
        expect((await detail(buyer.id)).data.orders).toEqual(first.data.orders);
        const last = await detail(buyer.id, { limit: 10, offset: 10 });
        expect(last.status).toBe(200);
        expect(last.data).toMatchObject({ count: 12, limit: 10, offset: 10 });
        expect(last.data.orders).toHaveLength(2);
        const all = [...first.data.orders, ...last.data.orders];
        expect(new Set(all.map((order) => order.id))).toEqual(
          new Set([...split.order_ids, ...history.map((order) => order.id)]),
        );
        expect(
          all.some((order) =>
            [draft.id, draftFlag.id, otherOrder.id].includes(order.id),
          ),
        ).toBe(false);
        expect(all.find((order) => order.id === history[0].id)?.status).toBe(
          OrderStatus.CANCELED,
        );
        for (const [index, orderId] of split.order_ids.entries()) {
          expect(all.find((order) => order.id === orderId)).toMatchObject({
            display_id: expect.any(Number),
            created_at: expect.any(String),
            currency_code: "usd",
            total: 20,
            seller_name: `${namespace} seller ${index}`,
            items: [
              {
                title: `Disposable seller item ${index}`,
                variant_title: null,
                quantity: 1,
              },
            ],
          });
        }
        const beyond = await detail(buyer.id, { limit: 10, offset: 30 });
        expect(beyond.status).toBe(200);
        expect(beyond.data).toMatchObject({
          count: 12,
          limit: 10,
          offset: 30,
          orders: [],
        });
        expect((await detail(noPurchases.id)).status).toBe(404);
        expect((await detail(`cus_absent_${randomUUID()}`)).status).toBe(404);
      });

      it("falls back to a saved address phone or the latest native order's contact addresses for guests", async () => {
        const address = {
          address_1: "200 Default Street",
          city: "Miami",
          province: "fl",
          postal_code: "33102",
          country_code: "us",
        };
        const [saved, guest, billingOnly] = await customers([
          {
            email: `saved-${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
            addresses: [
              { ...address, is_default_shipping: true, phone: "+13035550120" },
            ],
          },
          {
            email: `guest-${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
          },
          {
            email: `billing-${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
          },
        ]);
        await purchase(saved.id);
        await purchase(guest.id);
        await purchase(billingOnly.id);
        await orders(saved.id, [
          { shipping_address: { ...address, phone: "+13035550999" } },
        ]);
        await orders(guest.id, [
          {
            shipping_address: {
              ...address,
              address_1: "100 Old Street",
              phone: "+13035550998",
            },
          },
        ]);
        await orders(billingOnly.id, [
          {
            billing_address: {
              ...address,
              address_1: "500 Billing Only Street",
              phone: "+13035550124",
            },
          },
        ]);
        const latestAddress = {
          ...address,
          address_1: "300 Latest Street",
          phone: "+13035550122",
        };
        await orders(guest.id, [
          {
            shipping_address: latestAddress,
            billing_address: {
              ...address,
              address_1: "400 Billing Street",
              phone: "+13035550123",
            },
          },
        ]);
        const savedDetail = await detail(saved.id);
        const list = await request();
        expect(list.status).toBe(200);
        expect(list.data.customers).toHaveLength(3);
        expect(
          list.data.customers.every((customer) => customer.phone === null),
        ).toBe(true);
        expect(savedDetail.status).toBe(200);
        expect(savedDetail.data.customer.phone).toBe("+13035550120");
        const guestDetail = await detail(guest.id);
        expect(guestDetail.status).toBe(200);
        expect(guestDetail.data.customer.phone).toBe("+13035550122");
        expect(guestDetail.data.customer.addresses).toEqual([
          { ...address, address_1: "300 Latest Street", address_2: null },
        ]);
        expect(
          guestDetail.data.customer.addresses.some(
            (entry) => entry.address_1 === "100 Old Street",
          ),
        ).toBe(false);
        const billingDetail = await detail(billingOnly.id);
        expect(billingDetail.status).toBe(200);
        expect(billingDetail.data.customer.phone).toBe("+13035550124");
        expect(billingDetail.data.customer.addresses).toEqual([
          { ...address, address_1: "500 Billing Only Street", address_2: null },
        ]);
      });

      it("requires an authenticated admin with customer.read, order_group.read and order.read for list and detail", async () => {
        const [buyer] = await customers([
          {
            email: `${namespace.toLowerCase()}@example.invalid`,
            has_account: true,
          },
        ]);
        await purchase(buyer.id);
        expect((await request({}, "")).status).toBe(401);
        expect((await detail(buyer.id, {}, "")).status).toBe(401);
        expect((await request({}, "invalid-token")).status).toBe(401);
        expect((await detail(buyer.id, {}, "invalid-token")).status).toBe(401);
        expect((await request({}, await operator([]))).status).toBe(403);
        for (const resources of [
          ["customer", "order_group"],
          ["customer", "order"],
          ["order_group", "order"],
        ]) {
          const token = await operator(resources);
          expect((await request({}, token)).status).toBe(403);
          expect((await detail(buyer.id, {}, token)).status).toBe(403);
        }
        const permitted = await request();
        expect(permitted.status).toBe(200);
        expect(permitted.data).toMatchObject({
          count: 1,
          limit: 10,
          offset: 0,
        });
        expect((await detail(buyer.id)).status).toBe(200);

        const account = await identity();
        const [customer] = await customers([
          { email: account.email, has_account: true },
        ]);
        await getContainer()
          .resolve<IAuthModuleService>(Modules.AUTH)
          .updateAuthIdentities({
            id: account.id,
            app_metadata: { customer_id: customer.id },
          });
        const customerToken = await login("customer", account);
        expect((await request({}, customerToken)).status).toBe(401);
        expect((await detail(buyer.id, {}, customerToken)).status).toBe(401);

        const sellerAccount = await identity();
        await createSellerAccountWorkflow(getContainer()).run({
          input: {
            auth_identity_id: sellerAccount.id,
            member_email: sellerAccount.email,
            seller: {
              name: namespace,
              handle: `purchases-${randomUUID()}`,
              email: sellerAccount.email,
              currency_code: "usd",
            },
          },
        });
        const memberToken = await login("member", sellerAccount);
        expect((await request({}, memberToken)).status).toBe(401);
        expect((await detail(buyer.id, {}, memberToken)).status).toBe(401);
      });

      it("rejects invalid pagination and unsupported query fields while accepting the documented boundaries", async () => {
        for (const params of [
          { limit: 0 },
          { limit: -1 },
          { limit: 101 },
          { limit: 1.5 },
          { limit: "invalid" },
          { limit: "Infinity" },
          { limit: [1, 2] },
          { offset: -1 },
          { offset: 0.5 },
          { offset: "invalid" },
          { offset: "Infinity" },
          { offset: [0, 1] },
          { q: "unsupported" },
        ]) {
          expect((await request(params)).status).toBe(400);
          expect(
            (await detail("cus_query_validation_fixture", params)).status,
          ).toBe(400);
        }
        for (const limit of [1, 100]) {
          const response = await request({ limit, offset: 0 });
          expect(response.status).toBe(200);
          expect(response.data).toEqual({
            customers: [],
            count: 0,
            limit,
            offset: 0,
          });
        }
        const [buyer] = await customers([
          {
            email: `${namespace.toLowerCase()}@example.invalid`,
            has_account: false,
          },
        ]);
        await purchase(buyer.id);
        for (const limit of [1, 100]) {
          const response = await detail(buyer.id, { limit, offset: 0 });
          expect(response.status).toBe(200);
          expect(response.data).toMatchObject({
            orders: [],
            count: 0,
            limit,
            offset: 0,
          });
        }
      });
    },
  });
}
