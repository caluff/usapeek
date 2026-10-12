/**
 * Opt-in PostgreSQL/HTTP integration. The runner creates, restores and drops a
 * random database and its template; Redis DB15 must be reserved for this suite.
 * Before pnpm, dot-source the closure infrastructure's
 * Import-ClosureTestEnvironment.ps1, then set
 * FINANCIAL_FOUNDATION_TESTS=disposable-local. From packages/api run:
 * pnpm test:integration:http --runTestsByPath integration-tests/http/financial-foundation.spec.ts
 *
 * Uses real native commission workflows, HTTP auth/RBAC, orders and persistence.
 * Order/payment allocation fixtures bypass checkout. Refund assertions exercise
 * the cumulative policy using the persisted original, not Stripe or transfers.
 * No external notification, payment, search or storage provider may be loaded.
 */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createUsersWorkflow,
} from "@medusajs/core-flows";
import {
  createCommissionRatesWorkflow,
  refreshOrderCommissionLinesWorkflow,
  updateCommissionRatesWorkflow,
} from "@mercurjs/core/workflows";
import { CommissionRateType, MercurModules } from "@mercurjs/types";
import type { CommissionCalculationContext } from "@mercurjs/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  Modules,
} from "@medusajs/framework/utils";
import type {
  IAuthModuleService,
  ICartModuleService,
  IFulfillmentModuleService,
  IOrderModuleService,
  IPaymentModuleService,
  IProductModuleService,
} from "@medusajs/framework/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import type OfferModule from "@mercurjs/core/modules/offer";
import type CommissionModuleService from "../../src/modules/commission/service";
import type CommerceAutomationService from "../../src/modules/commerce-automation/service";
import { COMMERCE_AUTOMATION_MODULE } from "../../src/modules/commerce-automation";
import {
  assertOriginalGroup,
  buildOriginalSale,
  originalSaleSchema,
  saleGroupSchema,
  type OriginalSale,
  type SaleGroup,
} from "../../src/lib/order-finance/snapshot";
import { proportionalSettlement } from "../../src/lib/order-finance/settlement";
import { freezeOriginalSaleWorkflow } from "../../src/workflows/freeze-original-sale";

type UpdateInput = Parameters<
  CommissionModuleService["updateCommissionRates"]
>[0];

const enabled = process.env.FINANCIAL_FOUNDATION_TESTS === "disposable-local";
const orderFixtureSchema = saleGroupSchema.shape.orders.element.pick({
  id: true,
  version: true,
  currency_code: true,
  total: true,
  items: true,
});

if (!enabled) {
  describe.skip("Financial foundation integration (requires disposable-local opt-in)", () => {
    it("requires the reserved local PostgreSQL/Redis infrastructure; see file header", () => {});
  });
} else {
  // Validate before runner registration: even failure cleanup has database effects.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS
  ) {
    throw new Error(
      "Use the closure importer: explicit localhost:55432 PostgreSQL credentials and verified TLS are required.",
    );
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (
    redis.protocol !== "rediss:" ||
    redis.hostname !== "localhost" ||
    redis.port !== "56379" ||
    redis.pathname !== "/15" ||
    !redis.username ||
    !redis.password
  ) {
    throw new Error(
      "Reserve the closure's dedicated localhost:56379 TLS Redis DB15 before running this suite.",
    );
  }
  if (process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error(
      "Remove DB_TEMP_NAME/MEDUSA_DB_SCHEMA overrides; this suite owns random disposable names.",
    );
  }
  const dbName = `finance_test_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        const target = new URL(config.projectConfig.databaseUrl!);
        if (
          target.hostname !== "localhost" ||
          target.port !== "55432" ||
          target.pathname !== `/${dbName}`
        ) {
          throw new Error(
            "Refusing to run: app database does not match the disposable runner database.",
          );
        }
        for (const module of Object.values(config.modules ?? {})) {
          if (!module || typeof module !== "object") continue;
          const providers =
            "options" in module ? module.options?.providers : undefined;
          const adapters = [
            module,
            ...(Array.isArray(providers) ? providers : []),
          ];
          if (
            adapters.some(
              (adapter: { resolve?: unknown }) =>
                typeof adapter.resolve === "string" &&
                /stripe|resend|algolia|file-s3|google/i.test(adapter.resolve),
            )
          ) {
            throw new Error(
              "The closure importer must disable external notification/payment/search/storage/auth adapters.",
            );
          }
        }
      },
    },
    testSuite: ({ api, dbConnection, getContainer }) => {
      const commission = () =>
        getContainer().resolve<CommissionModuleService>(
          MercurModules.COMMISSION,
        );
      const journal = () =>
        getContainer().resolve<CommerceAutomationService>(
          COMMERCE_AUTOMATION_MODULE,
        );
      const orders = () =>
        getContainer().resolve<IOrderModuleService>(Modules.ORDER);
      const auth = () =>
        getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      let defaultRateId: string;

      const invalidRates = [
        {
          label: "negative percentage",
          data: { type: CommissionRateType.PERCENTAGE, value: -8 },
        },
        {
          label: "percentage over 100",
          data: { type: CommissionRateType.PERCENTAGE, value: 108 },
        },
        {
          label: "zero percentage",
          data: { type: CommissionRateType.PERCENTAGE, value: 0 },
        },
        {
          label: "negative fixed amount",
          data: {
            type: CommissionRateType.FIXED,
            value: -1,
            currency_code: "usd",
          },
        },
        {
          label: "zero fixed amount",
          data: {
            type: CommissionRateType.FIXED,
            value: 0,
            currency_code: "usd",
          },
        },
        {
          label: "negative currency override",
          data: {
            type: CommissionRateType.FIXED,
            value: 1,
            values: [{ currency_code: "usd", amount: -1 }],
          },
        },
      ];

      const request = (
        method: "GET" | "POST",
        url: string,
        token?: string,
        data?: unknown,
      ) =>
        api.request({
          method,
          url,
          data,
          headers: token ? { authorization: `Bearer ${token}` } : {},
          validateStatus: () => true,
        });

      async function administrator() {
        const email = `finance-${randomUUID()}@example.invalid`;
        const password = `Disposable-only-${randomUUID()}!`;
        const identity = await auth().register("emailpass", {
          body: { email, password },
        });
        if (!identity.success || !identity.authIdentity)
          throw new Error("Disposable admin identity registration failed");
        const authId = identity.authIdentity.id;
        const verification = await auth().requestAuthVerification({
          auth_identity_id: authId,
          entity_id: email,
          entity_type: "email",
          code_provider: "token",
        });
        if (!verification.code)
          throw new Error(
            "Disposable native verification fixture did not return a code",
          );
        await auth().confirmAuthVerification({
          code: verification.code,
          auth_identity_id: authId,
        });

        const rbac = getContainer().resolve(Modules.RBAC);
        const operations = ["read", "create", "update"];
        const policies = (
          await Promise.all(
            operations.map((operation) =>
              rbac.listRbacPolicies({ resource: "commission_rate", operation }),
            ),
          )
        ).flat();
        const missing = operations.filter(
          (operation) =>
            !policies.some((policy) => policy.operation === operation),
        );
        if (missing.length) {
          const { result } = await createRbacPoliciesWorkflow(
            getContainer(),
          ).run({
            input: {
              policies: missing.map((operation) => ({
                key: `commission_rate:${operation}`,
                resource: "commission_rate",
                operation,
              })),
            },
          });
          policies.push(...result);
        }
        const { result: roles } = await createRbacRolesWorkflow(
          getContainer(),
        ).run({
          input: {
            roles: [
              {
                name: `finance-test-${randomUUID()}`,
                policy_ids: policies.map((policy) => policy.id),
              },
            ],
          },
        });
        const { result: users } = await createUsersWorkflow(getContainer()).run(
          {
            input: {
              users: [{ email, roles: [roles[0].id] }],
            },
          },
        );
        await auth().updateAuthIdentities({
          id: authId,
          app_metadata: { user_id: users[0].id },
        });
        const response = await request(
          "POST",
          "/auth/user/emailpass",
          undefined,
          { email, password },
        );
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token as string;
      }

      async function orderFixture(prices: number[]) {
        // Native module fixtures are confined to the runner-owned database.
        const order = await orders().createOrders({
          currency_code: "usd",
          email: `order-${randomUUID()}@example.invalid`,
          items: prices.map((unit_price, index) => ({
            title: `Disposable item ${index}`,
            unit_price,
            quantity: 1,
          })),
        });
        const { data } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "order",
            fields: [
              "id",
              "version",
              "currency_code",
              "total",
              "items.*",
              "items.detail.*",
              "items.tax_lines.*",
              "items.adjustments.*",
              "shipping_methods.*",
              "shipping_methods.tax_lines.*",
              "shipping_methods.adjustments.*",
              "credit_lines.*",
            ],
            filters: { id: order.id },
          });
        const persisted = orderFixtureSchema.parse(data[0]);
        expect(persisted.version).toBe(1);
        const context: CommissionCalculationContext = {
          currency_code: "usd",
          items: persisted.items.map((item) => ({
            id: item.id,
            subtotal: item.subtotal,
            tax_total: item.tax_total,
          })),
          shipping_methods: [],
        };
        return { persisted, context };
      }

      async function originalGroup(pricesBySeller: number[][]) {
        const fixtures = await Promise.all(pricesBySeller.map(orderFixture));
        const gross = fixtures.reduce(
          (sum, fixture) => MathBN.add(sum, fixture.persisted.total).toNumber(),
          0,
        );
        const cartId = `cart_fixture_${randomUUID()}`;
        const collectionId = `paycol_fixture_${randomUUID()}`;
        const sessionId = `payses_fixture_${randomUUID()}`;
        const group: SaleGroup = {
          id: `group_fixture_${randomUUID()}`,
          cart_id: cartId,
          orders: fixtures.map(({ persisted }) => ({
            id: persisted.id,
            version: 1,
            currency_code: "usd",
            total: persisted.total,
            seller: { id: `seller_fixture_${randomUUID()}` },
            items: persisted.items.map((item) => ({
              id: item.id,
              subtotal: item.subtotal,
              tax_total: item.tax_total,
              discount_total: item.discount_total,
              discount_tax_total: item.discount_tax_total,
            })),
            shipping_methods: [],
            cart: {
              id: cartId,
              payment_collection: {
                id: collectionId,
                amount: gross,
                payment_sessions: [{ id: sessionId, status: "authorized" }],
              },
            },
          })),
        };
        const sales = await Promise.all(
          group.orders.map(async (order, index) =>
            buildOriginalSale(
              group,
              order,
              await commission().calculateOriginalLines(
                fixtures[index].context,
              ),
            ),
          ),
        );
        assertOriginalGroup(sales, group);
        return { group, sales, fixtures };
      }

      async function storedOriginal(orderId: string): Promise<OriginalSale> {
        const row = await journal().retrieveFinanceSaleSnapshot(orderId);
        return originalSaleSchema.parse(row.original);
      }

      async function linkedSaleFixture(price: number, discount = 0) {
        const container = getContainer();
        const id = randomUUID();
        const sellerService = container.resolve<
          InstanceType<typeof SellerModule.service>
        >(MercurModules.SELLER);
        const seller = await sellerService.createSellers({
          name: `Financial fixture ${id}`,
          handle: `financial-${id}`,
          email: `${id}@example.invalid`,
          currency_code: "usd",
        });
        const product = await container
          .resolve<IProductModuleService>(Modules.PRODUCT)
          .createProducts({
            title: "Financial fixture",
            handle: `financial-${id}`,
            options: [{ title: "Size", values: ["One"] }],
            variants: [
              {
                title: "One",
                options: { Size: "One" },
                manage_inventory: false,
              },
            ],
          });
        const profile = await container
          .resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)
          .createShippingProfiles({
            name: `Financial fixture ${id}`,
            type: "default",
          });
        const offer = await container
          .resolve<InstanceType<typeof OfferModule.service>>(
            MercurModules.OFFER,
          )
          .createOffers({
            seller_id: seller.id,
            product_id: product.id,
            variant_id: product.variants![0].id,
            shipping_profile_id: profile.id,
            sku: `financial-${id}`,
            created_by: "disposable-fixture",
            manage_inventory: false,
          });
        const item = {
          title: "Financial fixture",
          product_id: product.id,
          variant_id: product.variants![0].id,
          unit_price: price,
          quantity: 1,
          adjustments: discount
            ? [{ code: "DISPOSABLE_DISCOUNT", amount: discount }]
            : [],
        };
        const order = await orders().createOrders({
          currency_code: "usd",
          items: [item],
        });
        const cart = await container
          .resolve<ICartModuleService>(Modules.CART)
          .createCarts({ currency_code: "usd", items: [item] });
        const payment = container.resolve<IPaymentModuleService>(
          Modules.PAYMENT,
        );
        const collection = await payment.createPaymentCollections({
          currency_code: "usd",
          amount: MathBN.sub(price, discount).toNumber(),
        });
        // The built-in system provider is local. No authorization/capture or
        // external payment request occurs; this is a graph fixture for the hook.
        await payment.createPaymentSession(collection.id, {
          provider_id: "pp_system_default",
          currency_code: "usd",
          amount: collection.amount,
          data: {},
        });
        const group = await sellerService.createOrderGroups({
          cart_id: cart.id,
        });
        await container.resolve(ContainerRegistrationKeys.LINK).create([
          {
            [Modules.CART]: { cart_id: cart.id },
            [Modules.PAYMENT]: { payment_collection_id: collection.id },
          },
          {
            [Modules.ORDER]: { order_id: order.id },
            [Modules.CART]: { cart_id: cart.id },
          },
          {
            [Modules.ORDER]: { order_id: order.id },
            [MercurModules.SELLER]: { seller_id: seller.id },
          },
          {
            [MercurModules.SELLER]: { order_group_id: group.id },
            [Modules.ORDER]: { order_id: order.id },
          },
          {
            [Modules.ORDER]: { order_line_item_id: order.items![0].id },
            [MercurModules.OFFER]: { offer_id: offer.id },
          },
        ]);
        return { cart, group, order };
      }

      beforeEach(async () => {
        // Some native versions seed a zero default. Configure the test explicitly;
        // this never permits a zero-rate fixture to masquerade as a valid sale.
        const rates = await commission().listCommissionRates({});
        if (rates.length) {
          await updateCommissionRatesWorkflow(getContainer()).run({
            input: rates.map((rate) => ({
              id: rate.id,
              value: 8,
              is_enabled: true,
              include_shipping: false,
              include_tax: false,
            })),
          });
          defaultRateId =
            rates.find((rate) => rate.is_default)?.id ?? rates[0].id;
        } else {
          const rate = await commission().createCommissionRates({
            name: "Disposable default",
            code: `default-${randomUUID()}`,
            type: CommissionRateType.PERCENTAGE,
            value: 8,
            is_default: true,
            is_enabled: true,
            include_shipping: false,
            include_tax: false,
          });
          defaultRateId = rate.id;
        }
      });

      it("persists exact 19.99 and small-line multivendor originals once, conserving the shared collection", async () => {
        const { group, sales } = await originalGroup([
          [19.99],
          [0.04, 0.04, 0.04],
        ]);
        expect(sales[0]).toMatchObject({
          gross: 19.99,
          commission: 1.6,
          seller_entitlement: 18.39,
        });
        expect(sales[1]).toMatchObject({
          gross: 0.12,
          commission: 0.01,
          seller_entitlement: 0.11,
        });
        expect(
          sales[1].commission_lines.map((line) => line.amount).sort(),
        ).toEqual([0, 0, 0.01]);
        const sortedLines = [...sales[1].commission_lines].sort((a, b) =>
          a.item_id!.localeCompare(b.item_id!),
        );
        expect(sortedLines[0].amount).toBe(0.01);
        expect(
          MathBN.add(
            sales[0].allocation.amount,
            sales[1].allocation.amount,
          ).toNumber(),
        ).toBe(20.11);
        expect(sales[0].allocation.payment_collection_id).toBe(
          sales[1].allocation.payment_collection_id,
        );

        const inserts = await Promise.all([
          journal().recordOriginalSales(sales),
          journal().recordOriginalSales(sales),
        ]);
        expect(inserts.flat().sort()).toEqual(
          sales.map((sale) => sale.order_id).sort(),
        );
        expect(await journal().recordOriginalSales(sales)).toEqual([]);
        const rows = await journal().listFinanceSaleSnapshots({
          group_id: group.id,
        });
        expect(rows).toHaveLength(2);
        for (const sale of sales)
          expect(await storedOriginal(sale.order_id)).toEqual(sale);
      });

      it("rejects conflicting replay and database UPDATE without changing the original snapshot", async () => {
        const {
          sales: [sale],
        } = await originalGroup([[19.99]]);
        await journal().recordOriginalSales([sale]);
        const changed = structuredClone(sale);
        changed.commission_lines[0].code = "future-policy";
        await expect(journal().recordOriginalSales([changed])).rejects.toThrow(
          /inmutable/,
        );
        await expect(
          journal().updateFinanceSaleSnapshots({
            id: sale.order_id,
            original: changed,
          }),
        ).rejects.toThrow(/immutable|inmutable/i);
        await expect(
          dbConnection.raw(
            "update finance_sale_snapshot set seller_id = ? where id = ?",
            ["different_seller", sale.order_id],
          ),
        ).rejects.toThrow(/immutable|inmutable/i);
        expect(await storedOriginal(sale.order_id)).toEqual(sale);
      });

      it("keeps native commission rows and originals through a future rate change, refresh and cumulative refunds", async () => {
        const {
          sales: [sale],
          fixtures: [initial],
        } = await originalGroup([[19.99]]);
        await commission().upsertCommissionLines(
          (await commission().calculateOriginalLines(initial.context)).map(
            (result) => result.line,
          ),
        );
        await refreshOrderCommissionLinesWorkflow(getContainer()).run({
          input: { order_ids: [sale.order_id] },
        });
        await journal().recordOriginalSales([sale]);
        const itemId = sale.lines[0].id;
        const before = await commission().listCommissionLines({
          item_id: itemId,
        });
        expect(before).toHaveLength(1);
        expect(before[0]).toMatchObject({ rate: 8, amount: 1.6 });

        await updateCommissionRatesWorkflow(getContainer()).run({
          input: [{ id: defaultRateId, value: 12 }],
        });
        await refreshOrderCommissionLinesWorkflow(getContainer()).run({
          input: { order_ids: [sale.order_id] },
        });
        await refreshOrderCommissionLinesWorkflow(getContainer()).run({
          input: { order_ids: [sale.order_id] },
        });
        const after = await commission().listCommissionLines({
          item_id: itemId,
        });
        expect(after).toEqual(before);
        expect(await storedOriginal(sale.order_id)).toEqual(sale);

        const future = await orderFixture([19.99]);
        await commission().upsertCommissionLines(
          (await commission().calculateOriginalLines(future.context)).map(
            (result) => result.line,
          ),
        );
        await refreshOrderCommissionLinesWorkflow(getContainer()).run({
          input: { order_ids: [future.persisted.id] },
        });
        const futureLines = await commission().listCommissionLines({
          item_id: future.context.items![0].id,
        });
        expect(futureLines).toHaveLength(1);
        expect(futureLines[0]).toMatchObject({ rate: 12, amount: 2.4 });

        const original = await storedOriginal(sale.order_id);
        let refunded = 0;
        let sellerReturned = 0;
        let commissionReturned = 0;
        for (let index = 0; index < 1999; index++) {
          const part = proportionalSettlement(
            original.gross,
            original.seller_entitlement,
            refunded,
            0.01,
          );
          expect(
            MathBN.add(
              part.seller_reversed,
              part.commission_returned,
            ).toNumber(),
          ).toBe(0.01);
          refunded = MathBN.add(refunded, 0.01).toNumber();
          sellerReturned = MathBN.add(
            sellerReturned,
            part.seller_reversed,
          ).toNumber();
          commissionReturned = MathBN.add(
            commissionReturned,
            part.commission_returned,
          ).toNumber();
        }
        expect({ refunded, sellerReturned, commissionReturned }).toEqual({
          refunded: 19.99,
          sellerReturned: 18.39,
          commissionReturned: 1.6,
        });
        expect(await storedOriginal(sale.order_id)).toEqual(sale);
      });

      it("rejects invalid creates and updates through native workflows, leaving persisted rates untouched", async () => {
        const before = await commission().retrieveCommissionRate(defaultRateId);
        for (const { label, data } of invalidRates) {
          const code = `invalid-${randomUUID()}`;
          await expect(
            createCommissionRatesWorkflow(getContainer()).run({
              input: [
                {
                  name: label,
                  code,
                  ...data,
                },
              ],
            }),
          ).rejects.toMatchObject({
            message: expect.stringMatching(/commission|currency amounts/i),
          });
          expect(await commission().listCommissionRates({ code })).toHaveLength(
            0,
          );
          await expect(
            updateCommissionRatesWorkflow(getContainer()).run({
              input: [
                {
                  id: defaultRateId,
                  ...data,
                },
              ],
            }),
          ).rejects.toMatchObject({
            message: expect.stringMatching(/commission|currency amounts/i),
          });
          expect(
            await commission().retrieveCommissionRate(defaultRateId),
          ).toEqual(before);
        }
      });

      it("rejects overlapping rate update targets atomically while allowing disjoint batches", async () => {
        await updateCommissionRatesWorkflow(getContainer()).run({
          input: [
            {
              id: defaultRateId,
              type: CommissionRateType.FIXED,
              value: 1,
              currency_code: "usd",
            },
          ],
        });
        const before = await commission().retrieveCommissionRate(defaultRateId);
        const typeUpdate = { type: CommissionRateType.PERCENTAGE };
        const valueUpdate = { value: 101 };
        const overlapping = [
          [
            { selector: { is_enabled: true }, data: typeUpdate },
            { selector: { id: defaultRateId }, data: valueUpdate },
          ],
          [
            { selector: { id: defaultRateId }, data: typeUpdate },
            { id: defaultRateId, ...valueUpdate },
          ],
          [
            { id: defaultRateId, ...typeUpdate },
            { selector: { id: defaultRateId }, data: valueUpdate },
          ],
        ];
        for (const updates of overlapping) {
          await expect(
            commission().updateCommissionRates(updates as UpdateInput),
          ).rejects.toThrow("more than once");
          expect(
            await commission().retrieveCommissionRate(defaultRateId),
          ).toEqual(before);
        }
        await expect(
          updateCommissionRatesWorkflow(getContainer()).run({
            input: [
              { id: defaultRateId, ...typeUpdate },
              { id: defaultRateId, ...valueUpdate },
            ],
          }),
        ).rejects.toMatchObject({
          message: expect.stringContaining("more than once"),
        });
        expect(
          await commission().retrieveCommissionRate(defaultRateId),
        ).toEqual(before);

        const [other] = await commission().createCommissionRates([
          {
            name: "Disjoint percentage",
            code: `disjoint-${randomUUID()}`,
            type: CommissionRateType.PERCENTAGE,
            value: 8,
            is_enabled: true,
          },
        ]);
        // The native runtime also accepts a mix of selectors and direct IDs.
        await commission().updateCommissionRates([
          { selector: { id: defaultRateId }, data: valueUpdate },
          { id: other.id, value: 12 },
        ] as UpdateInput);
        expect(
          await commission().retrieveCommissionRate(defaultRateId),
        ).toMatchObject({ type: CommissionRateType.FIXED, value: 101 });
        expect(
          await commission().retrieveCommissionRate(other.id),
        ).toMatchObject({ type: CommissionRateType.PERCENTAGE, value: 12 });
      });

      it("blocks missing rules and resolves fixed commissions before enforcing the sale's gross entitlement", async () => {
        const fixture = await orderFixture([0.01]);
        await updateCommissionRatesWorkflow(getContainer()).run({
          input: [{ id: defaultRateId, is_enabled: false }],
        });
        await expect(
          commission().calculateOriginalLines(fixture.context),
        ).rejects.toThrow(/applicable positive commission rule/);
        await createCommissionRatesWorkflow(getContainer()).run({
          input: [
            {
              name: "Excess fixed fee",
              code: `fixed-${randomUUID()}`,
              type: CommissionRateType.FIXED,
              value: 1,
              currency_code: "usd",
              is_enabled: true,
            },
          ],
        });
        const resolved = await commission().calculateOriginalLines(
          fixture.context,
        );
        expect(resolved).toHaveLength(1);
        expect(resolved[0]).toMatchObject({
          type: "fixed",
          base: 0.01,
          unrounded_amount: "1",
          line: { rate: 1, amount: 1 },
        });
        expect(
          await commission().listCommissionLines({
            item_id: fixture.context.items![0].id,
          }),
        ).toHaveLength(0);
      });

      it("refuses to reconstruct legacy commission rows from the currently configured rate", async () => {
        const fixture = await orderFixture([19.99]);
        await expect(
          refreshOrderCommissionLinesWorkflow(getContainer()).run({
            input: { order_ids: [fixture.persisted.id] },
          }),
        ).rejects.toMatchObject({
          message: expect.stringMatching(
            /original|historical|reconcil|legacy/i,
          ),
        });
        expect(
          await commission().listCommissionLines({
            item_id: fixture.context.items![0].id,
          }),
        ).toHaveLength(0);
        expect(
          await journal().listFinanceSaleSnapshots({
            id: fixture.persisted.id,
          }),
        ).toHaveLength(0);
      });

      it("freezes the original through the real graph workflow and safely retries after a future rate change", async () => {
        const fixture = await linkedSaleFixture(19.99);
        const first = await freezeOriginalSaleWorkflow(getContainer()).run({
          input: { cart_id: fixture.cart.id },
        });
        expect(first.result.sale_ids).toEqual([fixture.order.id]);
        expect(first.result.commission_line_ids).toHaveLength(1);
        const original = await storedOriginal(fixture.order.id);
        expect(original).toMatchObject({
          gross: 19.99,
          commission: 1.6,
          seller_entitlement: 18.39,
        });
        await updateCommissionRatesWorkflow(getContainer()).run({
          input: [{ id: defaultRateId, value: 12 }],
        });
        const repeated = await freezeOriginalSaleWorkflow(getContainer()).run({
          input: { cart_id: fixture.cart.id },
        });
        expect(repeated.result).toEqual({
          sale_ids: [],
          commission_line_ids: [],
        });
        expect(await storedOriginal(fixture.order.id)).toEqual(original);
        const lines = await commission().listCommissionLines({
          item_id: fixture.order.items![0].id,
        });
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
          id: first.result.commission_line_ids[0],
          rate: 8,
          amount: 1.6,
        });
      });

      it("rejects a fixed commission above discounted gross in the real snapshot workflow without partial persistence", async () => {
        const fixture = await linkedSaleFixture(100, 95);
        await updateCommissionRatesWorkflow(getContainer()).run({
          input: [
            {
              id: defaultRateId,
              type: CommissionRateType.FIXED,
              value: 10,
              currency_code: "usd",
            },
          ],
        });
        await expect(
          freezeOriginalSaleWorkflow(getContainer()).run({
            input: { cart_id: fixture.cart.id },
          }),
        ).rejects.toMatchObject({
          message: expect.stringMatching(
            /comisión supera el importe repartible/,
          ),
        });
        expect(
          await journal().listFinanceSaleSnapshots({
            group_id: fixture.group.id,
          }),
        ).toHaveLength(0);
        expect(
          await commission().listCommissionLines({
            item_id: fixture.order.items![0].id,
          }),
        ).toHaveLength(0);
      });

      it("rejects invalid admin HTTP creates and updates after real authentication while permitting valid rates", async () => {
        const token = await administrator();
        const anonymous = await request(
          "POST",
          "/admin/commission-rates",
          undefined,
          {
            name: "Unauthorized",
            code: `unauthorized-${randomUUID()}`,
            type: "percentage",
            value: 8,
          },
        );
        expect(anonymous.status).toBe(401);
        const created = await request(
          "POST",
          "/admin/commission-rates",
          token,
          {
            name: "Valid HTTP fixture",
            code: `valid-${randomUUID()}`,
            type: "percentage",
            value: 8,
          },
        );
        expect(created.status).toBe(201);
        const rateId = created.data.commission_rate.id as string;
        const before = await commission().retrieveCommissionRate(rateId);
        for (const { label, data } of invalidRates) {
          const code = `invalid-http-${randomUUID()}`;
          const invalidCreate = await request(
            "POST",
            "/admin/commission-rates",
            token,
            { name: label, code, ...data },
          );
          expect(invalidCreate.status).toBe(400);
          expect(await commission().listCommissionRates({ code })).toHaveLength(
            0,
          );
          const invalidUpdate = await request(
            "POST",
            `/admin/commission-rates/${rateId}`,
            token,
            data,
          );
          expect(invalidUpdate.status).toBe(400);
          expect(await commission().retrieveCommissionRate(rateId)).toEqual(
            before,
          );
        }
        const updated = await request(
          "POST",
          `/admin/commission-rates/${rateId}`,
          token,
          { value: 12 },
        );
        expect(updated.status).toBe(200);
        expect((await commission().retrieveCommissionRate(rateId)).value).toBe(
          12,
        );
      });
    },
  });
}
