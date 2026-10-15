/**
 * Opt-in PG/native workflow regression, with ALL Stripe IO explicitly simulated.
 * Requires the isolated TLS PostgreSQL/Redis importer and exclusive Redis DB15.
 * FINANCE_EFFECT_DURABILITY_TESTS=disposable-local. Never run beside financial QA.
 * FINANCE_EFFECT_DURABILITY_MODE=live selects simulated LIVE responses with
 * ordinary classification; no LIVE credentials or network access are required.
 * Checkout is bypassed by native module/link fixtures. No real provider evidence
 * or OS process crash is claimed: injected boundary failures leave real PG rows.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createCustomerAccountWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/core-flows";
import type {
  IAuthModuleService,
  IEventBusModuleService,
  IInventoryService,
  IOrderModuleService,
  IPaymentModuleService,
  MedusaContainer,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MathBN,
  Modules,
  PaymentEvents,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { COMMERCE_AUTOMATION_MODULE } from "../../src/modules/commerce-automation";
import type CommerceAutomationService from "../../src/modules/commerce-automation/service";
import { readFinanceExecutionWriters } from "../../src/modules/commerce-automation/service";
import {
  financeAmount,
  financeOperationSchema,
} from "../../src/lib/order-finance/policy";
import { readOrderFinance } from "../../src/lib/order-finance/read";
import { inspectFinanceRecovery } from "../../src/lib/order-finance/recovery-plan";
import { prepareOrderSettlement } from "../../src/lib/order-finance/settlement-plan";
import type { CustomerReturnsResponse } from "../../src/lib/order-finance/contracts";
import type SellerModule from "@mercurjs/core/modules/seller";
import type RbacModule from "@medusajs/medusa/rbac";
import {
  approveSellerWorkflow,
  createSellerDefaultRolesStep,
  splitCapturedCartPaymentWorkflow,
} from "@mercurjs/core/workflows";
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { MercurModules, SellerRole } from "@mercurjs/types";
import { providerFinanceFactSchema } from "../../src/lib/order-finance/provider-facts";
import { operateOrderFinanceWorkflow } from "../../src/workflows/operate-order-finance";
import { recoverOrderFinanceWorkflow } from "../../src/workflows/recover-order-finance";
import { guardOrderFinanceWriterWorkflow } from "../../src/workflows/guard-order-finance-writer";
import {
  inspectOrderFinanceProviderFacts,
  refreshOrderFinanceProviderFactsWorkflow,
} from "../../src/workflows/refresh-order-finance-provider-facts";
import { createFinanceDurabilityFixture as createNativeFinanceDurabilityFixture } from "./fixtures/finance-durability-fixture";
import { installFinanceDurabilityStripe } from "./fixtures/finance-durability-stripe";
import { assertNativeFinanceRedis } from "../helpers/native-finance-redis-guard";
import { useNativeEsmPayoutProvider } from "../helpers/native-esm-provider-loader";
import { configureNativeFinanceDatabaseTls } from "../helpers/native-finance-database-tls";
import { cancelOrderFulfillmentWorkflow } from "@mercurjs/core/workflows/order/workflows/cancel-order-fulfillment";
import { capturePreparedPurchase } from "../../src/lib/order-finance/automatic-capture";
import { assertAutomaticCaptureSettings } from "../../src/lib/order-finance/capture-settings";
import { reconcileAutomaticCaptures } from "../../src/workflows/reconcile-automatic-captures";
import { updatePaymentCaptureSettings } from "../../src/workflows/update-payment-capture-settings";
import { settleOrderFinanceWorkflow } from "../../src/workflows/settle-order-finance";

const enabled =
  process.env.FINANCE_EFFECT_DURABILITY_TESTS === "disposable-local";
const mode = process.env.FINANCE_EFFECT_DURABILITY_MODE ?? "test";
if (mode !== "test" && mode !== "live")
  throw new Error("Finance effect durability mode must be test or live.");
const livemode = mode === "live";
const apiKey = `sk_${mode}_durabilityfixture`;

function createFinanceDurabilityFixture(
  container: Parameters<typeof createNativeFinanceDurabilityFixture>[0],
  options: NonNullable<
    Parameters<typeof createNativeFinanceDurabilityFixture>[1]
  > = {},
) {
  return createNativeFinanceDurabilityFixture(container, {
    ...options,
    livemode,
  });
}

const restoreVendorRolesWorkflow = createWorkflow(
  "durability-fixture-restore-vendor-roles",
  function () {
    return new WorkflowResponse(createSellerDefaultRolesStep());
  },
);

if (!enabled) {
  describe.skip("Finance effect durability (requires exclusive disposable-local infrastructure)", () => {
    it("requires explicit opt-in; see file header", () => {});
  });
} else {
  // Validate before registering the runner: its failure cleanup also touches DB.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS ||
    !existsSync(process.env.NODE_EXTRA_CA_CERTS) ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  )
    throw new Error(
      "Import the isolated TLS closure environment without database overrides.",
    );
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (
    redis.protocol !== "rediss:" ||
    redis.hostname !== "localhost" ||
    redis.port !== "56379" ||
    redis.pathname !== "/15" ||
    !redis.username ||
    !redis.password ||
    redis.search ||
    redis.hash
  )
    throw new Error(
      "Reserve the isolated TLS Redis DB15 exclusively before running this suite.",
    );
  assertNativeFinanceRedis(process.env);
  const dbName = `closure_finance_durability_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  // These deliberately invalid credentials can only reach the installed simulator.
  process.env.STRIPE_API_KEY = apiKey;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_durabilityfixture";
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = "whsec_durabilityfixture";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.STRIPE_MODE = mode;
  process.env.STRIPE_LIVE_ENABLED = String(livemode);
  process.env.STRIPE_ACCOUNT_ID = "acct_durabilityplatform";
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  process.env.FINANCE_CHECKOUT_DATA_KIND = livemode ? "ordinary" : "qa_fixture";
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);
  let stripe = installFinanceDurabilityStripe(livemode);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        assertNativeFinanceRedis(process.env, config);
        const target = new URL(config.projectConfig.databaseUrl!);
        if (
          target.hostname !== "localhost" ||
          target.port !== "55432" ||
          target.pathname !== `/${dbName}`
        )
          throw new Error(
            "Application and runner must use the same disposable database.",
          );
        for (const module of Object.values(config.modules ?? {})) {
          if (!module || typeof module !== "object") continue;
          const providers =
            "options" in module ? module.options?.providers : undefined;
          if (
            [module, ...(Array.isArray(providers) ? providers : [])].some(
              (adapter: { resolve?: unknown }) =>
                typeof adapter.resolve === "string" &&
                /resend|algolia|file-s3|google/i.test(adapter.resolve),
            )
          )
            throw new Error(
              "Disable all external adapters except the transport-simulated Stripe fixture.",
            );
          for (const adapter of [
            module,
            ...(Array.isArray(providers) ? providers : []),
          ]) {
            if (
              typeof adapter.resolve === "string" &&
              /stripe/i.test(adapter.resolve) &&
              adapter.options?.apiKey !== apiKey
            )
              throw new Error(
                "Only the explicit simulated Stripe key is allowed.",
              );
          }
        }
        await useNativeEsmPayoutProvider(config);
        configureNativeFinanceDatabaseTls(config, dbName);
      },
    },
    testSuite: ({ api, getContainer, dbConnection }) => {
      type Fixture = Awaited<ReturnType<typeof createFinanceDurabilityFixture>>;
      const journal = () =>
        getContainer().resolve<CommerceAutomationService>(
          COMMERCE_AUTOMATION_MODULE,
        );
      const read = (fixture: Fixture, orderId = fixture.orderId) =>
        readOrderFinance(getContainer(), orderId, {
          actor_id: fixture.actorId,
        });
      const input = (fixture: Fixture) => ({
        action: "refund" as const,
        amount: 20,
        confirm: true as const,
        note: "Durability regression with simulated Stripe IO",
        request_id: randomUUID(),
        order_id: fixture.orderId,
        actor_id: fixture.actorId,
      });
      type Input = ReturnType<typeof input>;
      const operationId = (request: Input) =>
        `refund:${request.order_id}:${request.request_id}`;
      const operate = (request: Input) =>
        operateOrderFinanceWorkflow(getContainer()).run({ input: request });
      const recoveryInput = (request: Input) => ({
        order_id: request.order_id,
        actor_id: request.actor_id,
        operation_id: operationId(request),
        reason: "Recover verified simulated effect from real PG journal",
      });
      async function persistedOperation(request: Input) {
        // A separate SQL read verifies durable state instead of retaining a JS DTO.
        const result = await dbConnection.raw(
          "select id, state, token, result from commerce_operation where id = ? and deleted_at is null",
          [operationId(request)],
        );
        return z
          .object({
            id: z.string(),
            state: z.string(),
            token: z.string(),
            result: financeOperationSchema,
          })
          .parse(result.rows[0]);
      }
      async function fixture(withPayout = false) {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPayout,
        });
        if (withPayout) stripe.seedTransfer(value.orderId, value.sellerId);
        const current = await read(value);
        expect(current.originalProblem).toBeNull();
        expect(current.view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 0,
          refund: { allowed: true },
        });
        expect(
          (await read(value, value.siblingOrderId)).view.finance,
        ).toMatchObject({ captured_total: 30, refunded_total: 0 });
        return value;
      }
      async function actorToken(
        actorId: string,
        actorType: "customer" | "user",
      ) {
        const { data: roleLinks }: { data: unknown } =
          actorType === "user"
            ? await getContainer()
                .resolve(ContainerRegistrationKeys.QUERY)
                .graph(
                  {
                    entity: "user_rbac_role",
                    fields: ["rbac_role_id"],
                    filters: { user_id: actorId },
                  },
                  { cache: { enable: false } },
                )
            : { data: [] };
        const roles = z
          .array(z.object({ rbac_role_id: z.string().min(1) }))
          .parse(roleLinks)
          .map((link) => link.rbac_role_id);
        const metadata = {
          [`${actorType}_id`]: actorId,
          ...(actorType === "user" ? { roles } : {}),
        };
        const identity = await getContainer()
          .resolve<IAuthModuleService>(Modules.AUTH)
          .createAuthIdentities({
            app_metadata: metadata,
            provider_identities: [
              {
                provider: "emailpass",
                entity_id: `${randomUUID()}@example.invalid`,
              },
            ],
          });
        const { http } = getContainer().resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        ).projectConfig;
        return generateJwtToken(
          {
            actor_id: actorId,
            actor_type: actorType,
            auth_identity_id: identity.id,
            auth_provider: "emailpass",
            app_metadata: metadata,
          },
          {
            secret: http.jwtSecret,
            expiresIn: "10m",
            jwtOptions: http.jwtOptions,
          },
        );
      }
      async function storeContext() {
        const container = getContainer();
        const identity = await container
          .resolve<IAuthModuleService>(Modules.AUTH)
          .createAuthIdentities({
            provider_identities: [
              {
                provider: "google",
                entity_id: randomUUID(),
                user_metadata: {
                  email: `${randomUUID()}@example.invalid`,
                  email_verified: true,
                },
              },
            ],
          });
        const { result: customer } = await createCustomerAccountWorkflow(
          container,
        ).run({
          input: {
            authIdentityId: identity.id,
            customerData: {
              email: identity.provider_identities![0].user_metadata!
                .email as string,
            },
          },
        });
        const { http } = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        ).projectConfig;
        const token = generateJwtToken(
          {
            actor_id: customer.id,
            actor_type: "customer",
            auth_identity_id: identity.id,
            auth_provider: "google",
            app_metadata: {},
          },
          {
            secret: http.jwtSecret,
            expiresIn: "10m",
            jwtOptions: http.jwtOptions,
          },
        );
        const { result: channels } = await createSalesChannelsWorkflow(
          container,
        ).run({
          input: {
            salesChannelsData: [{ name: `Aftersales fixture ${randomUUID()}` }],
          },
        });
        const { result: keys } = await createApiKeysWorkflow(container).run({
          input: {
            api_keys: [
              {
                title: "Disposable aftersales fixture",
                type: "publishable",
                created_by: "finance-durability-test",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: { id: keys[0].id, add: [channels[0].id] },
        });
        return {
          customerId: customer.id,
          key: keys[0].token,
          headers: {
            "x-publishable-api-key": keys[0].token,
            authorization: `Bearer ${token}`,
          },
        };
      }
      async function assignCustomer(value: Fixture, customerId: string) {
        // Fixture-only native CRUD attaches an owner to the already-linked sale.
        await getContainer()
          .resolve<IOrderModuleService>(Modules.ORDER)
          .updateOrders(
            [value.orderId, value.siblingOrderId].map((id) => ({
              id,
              customer_id: customerId,
            })),
          );
      }
      async function vendorContext(sellerId: string) {
        // The runner clears persisted roles between cases while keeping the
        // native bootstrap's process cache. Restore its real bindings per fixture.
        const rbac = getContainer().resolve<
          InstanceType<typeof RbacModule.service>
        >(Modules.RBAC);
        await rbac.__hooks.onApplicationStart();
        await restoreVendorRolesWorkflow(getContainer()).run({
          input: undefined,
        });
        expect(
          (await rbac.listRbacPolicies()).some(
            (policy) => policy.key === "return:read",
          ),
        ).toBe(true);
        const seller = getContainer().resolve<
          InstanceType<typeof SellerModule.service>
        >(MercurModules.SELLER);
        await approveSellerWorkflow(getContainer()).run({
          input: { seller_id: sellerId },
        });
        const member = await seller.createMembers({
          email: `${randomUUID()}@example.invalid`,
        });
        await seller.createSellerMembers({
          seller_id: sellerId,
          member_id: member.id,
          role_id: SellerRole.SELLER_ADMINISTRATION,
          is_owner: true,
        });
        const identity = await getContainer()
          .resolve<IAuthModuleService>(Modules.AUTH)
          .createAuthIdentities({
            app_metadata: {
              member_id: member.id,
              roles: [SellerRole.SELLER_ADMINISTRATION],
            },
            provider_identities: [
              { provider: "emailpass", entity_id: member.email },
            ],
          });
        const { http } = getContainer().resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        ).projectConfig;
        const token = generateJwtToken(
          {
            actor_id: member.id,
            actor_type: "member",
            auth_identity_id: identity.id,
            auth_provider: "emailpass",
            app_metadata: identity.app_metadata ?? {},
          },
          {
            secret: http.jwtSecret,
            expiresIn: "10m",
            jwtOptions: http.jwtOptions,
          },
        );
        return { authorization: `Bearer ${token}`, "x-seller-id": sellerId };
      }
      async function returnRows(value: Fixture, withDeleted = false) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        return (
          await query.graph(
            {
              entity: "return",
              fields: [
                "id",
                "order_id",
                "status",
                "requested_at",
                "location_id",
                "metadata",
                "deleted_at",
                "items.*",
              ],
              filters: { order_id: value.orderId },
              withDeleted,
            },
            { cache: { enable: false } },
          )
        ).data;
      }
      async function returnChanges(value: Fixture) {
        return (
          await getContainer()
            .resolve(ContainerRegistrationKeys.QUERY)
            .graph(
              {
                entity: "order_change",
                fields: [
                  "id",
                  "status",
                  "return_id",
                  "actions.id",
                  "actions.action",
                  "actions.details",
                ],
                filters: {
                  order_id: value.orderId,
                  change_type: "return_request",
                },
              },
              { cache: { enable: false } },
            )
        ).data;
      }
      function customerReturn(value: Fixture, quantity = 3) {
        return {
          request_id: randomUUID(),
          reason: "wrong_item" as const,
          note: "Request the native marketplace return",
          items: [{ id: value.itemId, quantity }],
          confirm: true as const,
        };
      }
      async function recover(request: Input) {
        const inspection = await inspectFinanceRecovery(
          getContainer(),
          recoveryInput(request),
        );
        const result = await recoverOrderFinanceWorkflow(getContainer()).run({
          input: {
            ...recoveryInput(request),
            plan_hash: inspection.plan_hash,
            release_stopped_writer: false,
          },
        });
        expect(result.result).toMatchObject({
          state: "complete",
          fence_released: true,
        });
        return inspection;
      }
      async function verifyCompleted(
        value: Fixture,
        request: Input,
        withPayout = false,
      ) {
        const persisted = await persistedOperation(request);
        expect(persisted.state).toBe("complete");
        expect(persisted.result.refund_ids).toHaveLength(1);
        expect(persisted.result.provider_refund_id).toBe(stripe.refunds[0].id);
        const current = await read(value);
        expect(current.state?.active_token).toBeNull();
        expect(current.state?.review_required).toBe(false);
        expect(current.view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 20,
          refundable_total: 50,
        });
        const target = current.group.orders.find(
          (row) => row.id === value.orderId,
        )!;
        const payment = target.cart.payment_collection.payments[0];
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
          id: persisted.result.refund_ids[0],
          amount: 20,
          metadata: {
            finance_operation_id: operationId(request),
            order_id: value.orderId,
          },
        });
        expect(
          target.transactions
            .filter((row) => row.reference === "refund")
            .map((row) => {
              const exactMinor = MathBN.mult(row.amount, 100);
              const amountMinor = exactMinor.toNumber();
              expect(Number.isSafeInteger(amountMinor)).toBe(true);
              expect(MathBN.eq(exactMinor, amountMinor)).toBe(true);
              return {
                amount_minor: amountMinor,
                reference_id: row.reference_id,
              };
            }),
        ).toEqual([
          { amount_minor: -2000, reference_id: payment.refunds[0].id },
        ]);
        expect(
          target.credit_lines
            ?.filter((row) => row.reference === "refund")
            .map((row) => ({
              amount: financeAmount(row.amount),
              reference_id: row.reference_id,
            })),
        ).toEqual([{ amount: 20, reference_id: payment.refunds[0].id }]);
        expect(stripe.state.refundCreates).toBe(1);
        expect(stripe.state.reversalCreates).toBe(withPayout ? 1 : 0);
        expect(persisted.result.settlement).toMatchObject({
          seller_entitlement_reduced: 18.4,
          commission_returned: 1.6,
        });
        if (withPayout)
          expect(persisted.result.settlement).toMatchObject({
            reversal_id: stripe.reversals[0].id,
            seller_reversed: 18.4,
          });
        const sibling = await read(value, value.siblingOrderId);
        expect(sibling.view.finance).toMatchObject({
          captured_total: 30,
          refunded_total: 0,
          refundable_total: 30,
        });
        expect(
          sibling.group.orders
            .find((row) => row.id === value.siblingOrderId)!
            .transactions.filter((row) => row.reference === "refund"),
        ).toHaveLength(0);
        // Same request after recovery is a journal replay, with no provider POST.
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        await operate(request);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
        expect(await persistedOperation(request)).toEqual(persisted);
      }
      function failJournalAfterEffect(kind: "refund" | "reversal") {
        const service = journal();
        const shouldFail = () =>
          kind === "refund"
            ? stripe.state.refundCreates > 0
            : stripe.state.reversalCreates > 0;
        const update = service.updateCommerceOperations.bind(service);
        const finish = service.finishOperation.bind(service);
        const updateSpy = jest
          .spyOn(service, "updateCommerceOperations")
          .mockImplementation(async (...args) => {
            if (shouldFail())
              throw new Error(
                "Injected unavailable journal after provider effect",
              );
            return update(...args);
          });
        const finishSpy = jest
          .spyOn(service, "finishOperation")
          .mockImplementation(async (...args) => {
            if (shouldFail())
              throw new Error(
                "Injected unavailable journal after provider effect",
              );
            return finish(...args);
          });
        return () => {
          updateSpy.mockRestore();
          finishSpy.mockRestore();
        };
      }

      async function drainNativeEvents() {
        const eventBus = getContainer().resolve(
          Modules.EVENT_BUS,
        ) as unknown as {
          queue_: {
            getJobCounts(...states: string[]): Promise<Record<string, number>>;
          };
        };
        let idle = 0;
        for (let attempt = 0; attempt < 120; attempt++) {
          const counts = await eventBus.queue_.getJobCounts(
            "active",
            "waiting",
            "delayed",
            "prioritized",
            "failed",
          );
          expect(counts.failed).toBe(0);
          idle = ["active", "waiting", "delayed", "prioritized"].every(
            (state) => counts[state] === 0,
          )
            ? idle + 1
            : 0;
          if (idle >= 3) return;
          await delay(250);
        }
        throw new Error(
          "Native subscribers did not finish before database restoration.",
        );
      }

      beforeEach(async () => {
        stripe.restore();
        stripe = installFinanceDurabilityStripe(livemode);
        const result = await dbConnection.raw(
          "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
        );
        expect(result.rows).toEqual([{ ssl: true }]);
      });
      afterEach(async () => {
        await drainNativeEvents();
        // No unexpected endpoint may be swallowed by a provider-fact read.
        expect(stripe.rejected).toEqual([]);
      });
      afterAll(() => stripe.restore());

      if (livemode) {
        it("keeps automatic LIVE capture disabled before any container resolution or provider call", async () => {
          const resolve = jest.fn(() => {
            throw new Error(
              "Automatic LIVE capture must not resolve infrastructure.",
            );
          });
          const blocked = { resolve } as unknown as MedusaContainer;
          await expect(
            capturePreparedPurchase(blocked, "order_preparation"),
          ).resolves.toBe("manual");
          await expect(
            reconcileAutomaticCaptures(blocked),
          ).resolves.toBeUndefined();
          await expect(
            assertAutomaticCaptureSettings(
              blocked,
              "initial",
              "user_preparation",
            ),
          ).rejects.toThrow("Stripe TEST");
          await expect(
            updatePaymentCaptureSettings(blocked, {
              mode: "automatic",
              expected_revision: "initial",
              actor_id: "user_preparation",
            }),
          ).rejects.toThrow("Stripe TEST");
          expect(resolve).not.toHaveBeenCalled();
          expect(stripe.requests).toEqual([]);
        });
      }

      it("creates one manual transfer through the native provider and replays its durable settlement without new effects", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPayoutAccount: true,
        });
        if (!value.payoutAccountId)
          throw new Error("The disposable connected account is missing.");
        stripe.accounts.set("acct_durabilityseller", {
          id: "acct_durabilityseller",
          object: "account",
          type: "express",
          country: "US",
          business_type: "individual",
          email: null,
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          capabilities: { transfers: "active" },
          metadata: { account_id: value.payoutAccountId },
          requirements: {
            alternatives: [],
            current_deadline: null,
            currently_due: [],
            disabled_reason: null,
            errors: [],
            eventually_due: [],
            past_due: [],
            pending_verification: [],
          },
        });
        const request = {
          order_id: value.orderId,
          actor_id: value.actorId,
          request_id: randomUUID(),
          note: "Manual native transfer in the isolated offline regression",
        };
        const { result } = await settleOrderFinanceWorkflow(getContainer()).run(
          { input: request },
        );
        expect(result).toMatchObject({
          linked: true,
          transfer_attempted: true,
          transfer_id: "tr_durability",
          plan: {
            mode,
            amount: 64.4,
            currency_code: "usd",
            platform_account_id: "acct_durabilityplatform",
            account_id: value.payoutAccountId,
            destination: "acct_durabilityseller",
          },
        });
        const transfers = stripe.requests.filter(
          (entry) => entry.method === "POST" && entry.path === "/v1/transfers",
        );
        expect(transfers).toHaveLength(1);
        const body = new URLSearchParams(transfers[0].body);
        expect(Object.fromEntries(body)).toMatchObject({
          amount: "6440",
          currency: "usd",
          destination: "acct_durabilityseller",
          source_transaction: "ch_durability",
          transfer_group: "group_pi_durability",
          "metadata[finance_operation_id]": `payout:${value.orderId}`,
          "metadata[group_id]": value.groupId,
          "metadata[order_id]": value.orderId,
          "metadata[seller_id]": value.sellerId,
        });
        const idempotency = Object.entries(transfers[0].headers).find(
          ([key]) => key.toLowerCase() === "idempotency-key",
        )?.[1];
        expect(idempotency).toBe(
          `order-finance:payout:${value.orderId}:transfer`,
        );
        const current = await read(value);
        expect(current.payout).toMatchObject({
          id: result.payout_id,
          status: "paid",
          account_id: value.payoutAccountId,
        });
        expect(financeAmount(current.payout!.amount)).toBe(64.4);
        const facts = async () =>
          (
            await journal().listFinanceProviderFacts({
              group_id: value.groupId,
              mode,
            })
          )
            .map((entry) => providerFinanceFactSchema.parse(entry.fact))
            .sort((a, b) => a.key.localeCompare(b.key));
        const beforeFacts = await facts();
        expect(beforeFacts.map((fact) => fact.key)).toEqual([
          `stripe:${mode}:acct_durabilityplatform:capture:ch_durability`,
          `stripe:${mode}:acct_durabilityplatform:transfer:tr_durability`,
        ]);
        expect(beforeFacts[1]).toMatchObject({
          mode,
          amount_minor: 6440,
          account_id: "acct_durabilityplatform",
          order_id: value.orderId,
          seller_id: value.sellerId,
        });
        const posts = stripe.requests.filter(
          (entry) => entry.method === "POST",
        ).length;
        expect(
          (
            await settleOrderFinanceWorkflow(getContainer()).run({
              input: request,
            })
          ).result,
        ).toEqual(result);
        await refreshOrderFinanceProviderFactsWorkflow(getContainer()).run({
          input: {
            order_id: value.orderId,
            actor_id: value.actorId,
            group_id: value.groupId,
            cart_id: value.cartId,
            reason:
              "Verify the same persisted transfer facts without another effect",
          },
        });
        expect((await facts()).map((fact) => fact.key)).toEqual(
          beforeFacts.map((fact) => fact.key),
        );
        expect(
          stripe.requests.filter((entry) => entry.method === "POST"),
        ).toHaveLength(posts);
        expect(stripe.state).toMatchObject({
          transferCreates: 1,
          captureCalls: 1,
          refundCreates: 0,
          reversalCreates: 0,
        });
        const payouts = await dbConnection.raw(
          "select id from payout where deleted_at is null",
        );
        expect(payouts.rows).toEqual([{ id: result.payout_id }]);
      });

      it("aftersales rejects raw Store returns, unauthenticated access, other buyers, unowned orders and injected financial actions over HTTP", async () => {
        const value = await fixture();
        const buyer = await storeContext();
        const stranger = await storeContext();
        const anonymous = {
          headers: { "x-publishable-api-key": buyer.key },
          validateStatus: () => true,
        };
        const cancellation = {
          request_id: randomUUID(),
          note: "Cancel only my own marketplace order",
          confirm: true,
        };
        const returns = customerReturn(value, 1);
        const before = await read(value);
        const requests = stripe.requests.length;

        for (const headers of [
          anonymous.headers,
          buyer.headers,
          stranger.headers,
        ]) {
          const response = await api.post(
            "/store/returns",
            { order_id: value.orderId, items: returns.items },
            { headers, validateStatus: () => true },
          );
          expect(response.status).toBe(400);
          expect(response.data.message).toBe(
            "Solicita la devolución desde tu cuenta, en el detalle de tu pedido.",
          );
        }
        for (const path of ["cancellation", "returns"]) {
          expect(
            (await api.get(`/store/orders/${value.orderId}/${path}`, anonymous))
              .status,
          ).toBe(401);
          expect(
            (
              await api.post(
                `/store/orders/${value.orderId}/${path}`,
                path === "cancellation" ? cancellation : returns,
                anonymous,
              )
            ).status,
          ).toBe(401);
          // Authenticated possession of an order ID is insufficient without an owner.
          expect(
            (
              await api.post(
                `/store/orders/${value.orderId}/${path}`,
                path === "cancellation" ? cancellation : returns,
                { headers: buyer.headers, validateStatus: () => true },
              )
            ).status,
          ).toBe(404);
        }
        await assignCustomer(value, buyer.customerId);
        for (const path of ["cancellation", "returns"]) {
          expect(
            (
              await api.get(`/store/orders/${value.orderId}/${path}`, {
                headers: stranger.headers,
                validateStatus: () => true,
              })
            ).status,
          ).toBe(404);
          expect(
            (
              await api.post(
                `/store/orders/${value.orderId}/${path}`,
                path === "cancellation" ? cancellation : returns,
                { headers: stranger.headers, validateStatus: () => true },
              )
            ).status,
          ).toBe(404);
        }
        for (const action of ["refund", "capture"]) {
          const response = await api.post(
            `/store/orders/${value.orderId}/cancellation`,
            { ...cancellation, action, amount: 1 },
            { headers: buyer.headers, validateStatus: () => true },
          );
          expect(response.status).toBe(400);
        }
        expect(
          (
            await api.post(
              `/store/orders/${value.orderId}/returns`,
              { ...returns, action: "refund", amount: 1 },
              { headers: buyer.headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        const own = await api.get(
          `/store/orders/${value.orderId}/cancellation`,
          { headers: buyer.headers },
        );
        expect(own.data).toEqual({
          cancellation: { allowed: true, reason: null },
        });
        expect(own.headers["cache-control"]).toBe("private, no-store");
        expect((await read(value)).allocation).toEqual(before.allocation);
        expect((await read(value)).operations).toEqual([]);
        expect(await returnRows(value)).toEqual([]);
        expect(
          stripe.requests
            .slice(requests)
            .filter((row) => row.method === "POST"),
        ).toEqual([]);
      });

      it("aftersales lets only the owning buyer cancel their captured store order and replays the UUID without refunding its sibling over HTTP", async () => {
        const value = await fixture();
        const buyer = await storeContext();
        await assignCustomer(value, buyer.customerId);
        stripe.state.expectedRefundAmount = 7_000;
        const siblingBefore = (await read(value)).group.orders.find(
          (order) => order.id === value.siblingOrderId,
        )!;
        const body = {
          request_id: randomUUID(),
          note: "Cancel my captured store order",
          confirm: true,
        };
        const path = `/store/orders/${value.orderId}/cancellation`;
        const response = await api.post(path, body, { headers: buyer.headers });
        expect(response.data).toMatchObject({
          canceled: true,
          cancellation: { allowed: false },
        });
        const current = await read(value);
        expect(current.view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 70,
          refundable_total: 0,
          history: [
            {
              id: `cancel:${value.orderId}:${body.request_id}`,
              kind: "cancel",
              amount: 70,
              status: "complete",
            },
          ],
        });
        expect(
          current.group.orders.find((order) => order.id === value.orderId)
            ?.status,
        ).toBe("canceled");
        const siblingAfter = current.group.orders.find(
          (order) => order.id === value.siblingOrderId,
        )!;
        expect(siblingAfter).toMatchObject({
          status: siblingBefore.status,
          total: siblingBefore.total,
          items: siblingBefore.items,
          fulfillments: siblingBefore.fulfillments,
          seller: siblingBefore.seller,
          transactions: siblingBefore.transactions,
          credit_lines: siblingBefore.credit_lines,
          payment_collections: siblingBefore.payment_collections,
        });
        expect(
          (await read(value, value.siblingOrderId)).view.finance,
        ).toMatchObject({
          captured_total: 30,
          refunded_total: 0,
          refundable_total: 30,
        });
        expect(stripe.refunds).toHaveLength(1);
        expect(stripe.refunds[0].amount).toBe(7_000);
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        expect(
          (await api.post(path, body, { headers: buyer.headers })).data,
        ).toEqual(response.data);
        expect(
          (
            await api.post(
              path,
              { ...body, request_id: randomUUID() },
              { headers: buyer.headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
        expect(stripe.refunds).toHaveLength(1);
      });

      it("customer return preserves a native draft and requested quantities, rejects excess or foreign items and replays its UUID without duplicates over HTTP", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPhysicalShipment: true,
        });
        const buyer = await storeContext();
        await assignCustomer(value, buyer.customerId);
        const path = `/store/orders/${value.orderId}/returns`;
        const body = customerReturn(value);
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        const initial = await api.get(path, { headers: buyer.headers });
        expect(initial.data).toMatchObject({
          eligibility: { allowed: true, reason: null },
          items: [{ id: value.itemId, available_quantity: 3 }],
          requests: [],
        });
        for (const items of [
          [{ id: value.itemId, quantity: 4 }],
          [{ id: value.siblingItemId, quantity: 1 }],
        ]) {
          const response = await api.post(
            path,
            { ...body, items },
            { headers: buyer.headers, validateStatus: () => true },
          );
          expect(response.status).toBe(400);
          expect(response.data.message).toBe(
            "Revisa los artículos y las cantidades disponibles.",
          );
          expect(await returnRows(value)).toEqual([]);
        }
        const concurrent = await Promise.all([
          api.post(path, body, {
            headers: buyer.headers,
            validateStatus: () => true,
          }),
          api.post(path, body, {
            headers: buyer.headers,
            validateStatus: () => true,
          }),
        ]);
        expect(concurrent.some((response) => response.status === 200)).toBe(
          true,
        );
        expect(
          concurrent.every((response) => [200, 409].includes(response.status)),
        ).toBe(true);
        const first = concurrent.find((response) => response.status === 200)!;
        for (const response of concurrent.filter(
          (response) => response.status === 200,
        ))
          expect(response.data).toEqual(first.data);
        expect(
          readFinanceExecutionWriters(
            (await read(value)).state?.observation ?? {},
          ),
        ).toEqual([]);
        expect(first.headers["cache-control"]).toBe("private, no-store");
        expect(first.data).toMatchObject({
          eligibility: { allowed: false },
          requests: [
            { status: "pending", reason: "wrong_item", note: body.note },
          ],
        });
        const nativeReturns = await returnRows(value);
        expect(nativeReturns).toHaveLength(1);
        expect(nativeReturns[0]).toMatchObject({
          requested_at: null,
          order_id: value.orderId,
          metadata: {
            usapeek_customer_return: {
              request_id: body.request_id,
              customer_id: buyer.customerId,
              items: body.items,
            },
          },
        });
        const changes = await returnChanges(value);
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({
          status: "pending",
          return_id: nativeReturns[0].id,
          actions: [
            {
              action: "RETURN_ITEM",
              details: { reference_id: value.itemId, quantity: 3 },
            },
          ],
        });
        const replay = await api.post(path, body, { headers: buyer.headers });
        expect(replay.data).toEqual(first.data);
        expect(await returnRows(value)).toEqual(nativeReturns);
        expect(await returnChanges(value)).toEqual(changes);
        const ownerHeaders = await vendorContext(value.sellerId);
        const otherHeaders = await vendorContext(value.siblingSellerId);
        const ownQueue = await api.get("/vendor/returns", {
          headers: ownerHeaders,
          validateStatus: () => true,
        });
        expect({ status: ownQueue.status, body: ownQueue.data }).toMatchObject({
          status: 200,
        });
        expect(
          ownQueue.data.returns.map((entry: { id: string }) => entry.id),
        ).toEqual([nativeReturns[0].id]);
        expect(
          (await api.get("/vendor/returns", { headers: otherHeaders })).data
            .returns,
        ).toEqual([]);
        expect(
          (
            await api.get(`/vendor/returns/${nativeReturns[0].id}`, {
              headers: otherHeaders,
              validateStatus: () => true,
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await api.post(
              `/vendor/returns/${nativeReturns[0].id}/request`,
              { no_notification: true },
              { headers: otherHeaders, validateStatus: () => true },
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await api.post(
              path,
              { ...body, items: [{ id: value.itemId, quantity: 1 }] },
              { headers: buyer.headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        expect(
          (
            await api.post(
              path,
              { ...body, request_id: randomUUID() },
              { headers: buyer.headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        expect(await returnRows(value)).toEqual(nativeReturns);
        expect((await read(value)).operations).toEqual([]);
        const nativePath = `/vendor/returns/${nativeReturns[0].id}`;
        for (const metadata of [
          null,
          { usapeek_customer_return: null },
          { usapeek_customer_return: "" },
          {
            usapeek_customer_return: {
              request_id: randomUUID(),
              customer_id: "forged_customer",
            },
          },
        ]) {
          const response = await api.post(
            nativePath,
            { metadata },
            {
              headers: ownerHeaders,
              validateStatus: () => true,
            },
          );
          expect(response.status).toBe(400);
          expect(response.data.message).toBe(
            "La identidad y el motivo originales de la solicitud del comprador no se pueden modificar.",
          );
          expect(await returnRows(value)).toEqual(nativeReturns);
        }
        const combined = await api.post(
          nativePath,
          {
            location_id: null,
            metadata: { usapeek_customer_return: null },
          },
          { headers: ownerHeaders, validateStatus: () => true },
        );
        expect(combined.status).toBe(400);
        expect(await returnRows(value)).toEqual(nativeReturns);
        await api.post(
          nativePath,
          { metadata: { fixture_marker: "native_merge" } },
          { headers: ownerHeaders },
        );
        const merged = await returnRows(value);
        expect(merged).toHaveLength(1);
        expect(merged[0].metadata).toEqual({
          ...nativeReturns[0].metadata,
          fixture_marker: "native_merge",
        });
        expect(
          (await api.post(path, body, { headers: buyer.headers })).data,
        ).toEqual(first.data);
        expect(await returnRows(value)).toEqual(merged);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
      });

      it("customer return uses native confirmation and cumulative Mercur reception, restocking only good Offer units over HTTP", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPhysicalShipment: true,
        });
        const buyer = await storeContext();
        await assignCustomer(value, buyer.customerId);
        const request = await api.post(
          `/store/orders/${value.orderId}/returns`,
          customerReturn(value),
          { headers: buyer.headers },
        );
        const response = request.data as CustomerReturnsResponse;
        const returnId = response.requests[0].id;
        const headers = {
          authorization: `Bearer ${await actorToken(value.actorId, "user")}`,
        };
        const nativePost = (suffix: string, body: object = {}) =>
          api.post(`/admin/returns/${returnId}${suffix}`, body, { headers });
        expect((await read(value)).view.finance.refund.allowed).toBe(false);
        const settlement = () =>
          prepareOrderSettlement(getContainer(), {
            order_id: value.orderId,
            actor_id: value.actorId,
          });
        await expect(settlement()).rejects.toThrow(
          "La liquidación requiere conciliación previa.",
        );
        const prematureRefund = await api.post(
          `/admin/orders/${value.orderId}/finance`,
          {
            request_id: randomUUID(),
            note: "Refund must wait for native reception",
            confirm: true,
            action: "refund",
            amount: 20,
          },
          { headers, validateStatus: () => true },
        );
        expect(prematureRefund.status).toBe(400);
        const native = () => returnRows(value).then((rows) => rows[0]);
        const inventory = getContainer().resolve<IInventoryService>(
          Modules.INVENTORY,
        );
        const stocked = async () => {
          const levels = await inventory.listInventoryLevels({
            inventory_item_id: value.inventoryItemId!,
            location_id: value.locationId!,
          });
          expect(levels).toHaveLength(1);
          return financeAmount(levels[0].stocked_quantity);
        };
        const stockBefore = await stocked();
        expect(stockBefore).toBe(7);
        const before = await read(value);
        const siblingBefore = await read(value, value.siblingOrderId);
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        // Request confirmation cannot skip a destination or cross seller warehouses.
        expect(
          (
            await api.post(
              `/admin/returns/${returnId}/request`,
              { no_notification: true },
              { headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        const foreignWarehouse = await api.post(
          `/admin/returns/${returnId}`,
          { location_id: value.siblingLocationId },
          { headers, validateStatus: () => true },
        );
        expect(foreignWarehouse.status).toBe(400);
        expect(foreignWarehouse.data.message).toBe("inventory_scope_forbidden");
        await nativePost("", { location_id: value.locationId });
        await nativePost("/request", { no_notification: true });
        expect(await native()).toMatchObject({
          status: "requested",
          location_id: value.locationId,
          items: [
            {
              item_id: value.itemId,
              quantity: 3,
              received_quantity: 0,
              damaged_quantity: 0,
            },
          ],
        });
        const approved = await api.get(
          `/store/orders/${value.orderId}/returns`,
          { headers: buyer.headers },
        );
        expect(approved.data).toMatchObject({
          items: [{ available_quantity: 0 }],
          requests: [{ status: "approved" }],
        });
        expect(approved.data.requests[0].destination).toContain(
          "Disposable fixture warehouse",
        );
        await nativePost("/receive");
        await nativePost("/receive-items", {
          items: [{ id: value.itemId, quantity: 1 }],
        });
        await nativePost("/receive/confirm");
        expect(await native()).toMatchObject({
          status: "partially_received",
          items: [
            {
              item_id: value.itemId,
              received_quantity: 1,
              damaged_quantity: 0,
            },
          ],
        });
        expect(await stocked()).toBe(stockBefore + 1);
        expect((await read(value)).view.finance.refund.allowed).toBe(false);
        await nativePost("/receive");
        await nativePost("/receive-items", {
          items: [{ id: value.itemId, quantity: 1 }],
        });
        await nativePost("/dismiss-items", {
          items: [{ id: value.itemId, quantity: 1 }],
        });
        await nativePost("/receive/confirm");
        expect(await native()).toMatchObject({
          status: "received",
          items: [
            {
              item_id: value.itemId,
              quantity: 3,
              received_quantity: 3,
              damaged_quantity: 1,
            },
          ],
        });
        expect(await stocked()).toBe(stockBefore + 2);
        const final = await api.get(`/store/orders/${value.orderId}/returns`, {
          headers: buyer.headers,
        });
        expect(final.data).toMatchObject({
          eligibility: { allowed: false },
          items: [{ available_quantity: 0 }],
          requests: [{ status: "received" }],
        });
        expect(
          (
            await api.post(
              `/store/orders/${value.orderId}/returns`,
              customerReturn(value, 1),
              { headers: buyer.headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        const after = await read(value);
        expect(after.view.finance.refund.allowed).toBe(true);
        expect(
          after.group.orders.find((order) => order.id === value.orderId)
            ?.summary?.pending_difference,
        ).toBe(-69);
        await expect(settlement()).rejects.toThrow(
          "La liquidación requiere conciliación previa.",
        );
        const economicRows = (current: typeof after) => {
          const order = current.group.orders.find(
            (row) => row.id === value.orderId,
          )!;
          return {
            allocation: current.allocation,
            transactions: order.transactions,
            credit_lines: order.credit_lines,
            payment: order.cart.payment_collection.payments,
            payment_collections: order.payment_collections,
          };
        };
        expect(economicRows(after)).toEqual(economicRows(before));
        const siblingAfter = await read(value, value.siblingOrderId);
        expect(siblingAfter.allocation).toEqual(siblingBefore.allocation);
        expect(
          siblingAfter.group.orders.find(
            (row) => row.id === value.siblingOrderId,
          ),
        ).toEqual(
          siblingBefore.group.orders.find(
            (row) => row.id === value.siblingOrderId,
          ),
        );
        expect(after.operations).toEqual([]);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
        stripe.state.expectedRefundAmount = 6_900;
        const refundBody = {
          action: "refund",
          amount: 69,
          request_id: randomUUID(),
          note: "Refund the fully received native return",
          confirm: true,
        };
        const refundPath = `/admin/orders/${value.orderId}/finance`;
        await api.post(refundPath, refundBody, { headers });
        const refunded = await read(value);
        expect(refunded.view.finance).toMatchObject({
          captured_total: 69,
          refunded_total: 69,
          refundable_total: 0,
        });
        const nativeOrder = refunded.group.orders.find(
          (order) => order.id === value.orderId,
        )!;
        expect(
          nativeOrder.transactions.filter(
            (transaction) => transaction.reference === "refund",
          ),
        ).toMatchObject([
          {
            amount: -69,
            reference_id:
              nativeOrder.cart.payment_collection.payments[0].refunds[0].id,
          },
        ]);
        // The native return already reduced the order total; the refund must not
        // deduct that same amount again with another economic credit line.
        expect(
          nativeOrder.credit_lines?.filter(
            (line) => line.reference === "refund",
          ) ?? [],
        ).toEqual([]);
        expect(nativeOrder.summary?.pending_difference).toBe(0);
        expect(nativeOrder.payment_collections).toEqual([]);
        const siblingRefunded = await read(value, value.siblingOrderId);
        expect(siblingRefunded.view.finance).toMatchObject({
          captured_total: 31,
          refunded_total: 0,
          refundable_total: 31,
        });
        expect(
          siblingRefunded.group.orders.find(
            (order) => order.id === value.siblingOrderId,
          )?.transactions,
        ).toEqual(
          siblingBefore.group.orders.find(
            (order) => order.id === value.siblingOrderId,
          )?.transactions,
        );
        expect(stripe.refunds).toHaveLength(1);
        expect(stripe.refunds[0].amount).toBe(6_900);
        const refundPosts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        await api.post(refundPath, refundBody, { headers });
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(refundPosts);
        expect(
          (await read(value)).group.orders.find(
            (order) => order.id === value.orderId,
          )?.transactions,
        ).toEqual(nativeOrder.transactions);
      });

      it("customer return cancels an approved native return before receipt and restores availability without a new payment or provider effect over HTTP", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPhysicalShipment: true,
        });
        const buyer = await storeContext();
        await assignCustomer(value, buyer.customerId);
        const buyerPath = `/store/orders/${value.orderId}/returns`;
        const draft = await api.post(buyerPath, customerReturn(value), {
          headers: buyer.headers,
        });
        const returnId = (draft.data as CustomerReturnsResponse).requests[0].id;
        const headers = await vendorContext(value.sellerId);
        await api.post(
          `/vendor/returns/${returnId}`,
          { location_id: value.locationId },
          { headers },
        );
        await api.post(
          `/vendor/returns/${returnId}/request`,
          { no_notification: true },
          { headers },
        );
        expect((await read(value)).view.finance.refund.allowed).toBe(false);
        expect(
          (await api.get(buyerPath, { headers: buyer.headers })).data,
        ).toMatchObject({
          items: [{ available_quantity: 0 }],
          requests: [{ status: "approved" }],
        });
        const before = await read(value);
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        await api.post(`/vendor/returns/${returnId}/cancel`, {}, { headers });
        const after = await read(value);
        expect(after.view.finance.refund.allowed).toBe(true);
        expect(
          (await api.get(buyerPath, { headers: buyer.headers })).data,
        ).toMatchObject({
          eligibility: { allowed: true, reason: null },
          items: [{ available_quantity: 3 }],
          requests: [{ status: "canceled" }],
        });
        expect((await returnRows(value))[0].status).toBe("canceled");
        const economic = (current: typeof after) =>
          current.group.orders.map((order) => ({
            id: order.id,
            transactions: order.transactions,
            credit_lines: order.credit_lines,
            payment_collections: order.payment_collections,
            payment: order.cart.payment_collection.payments,
          }));
        expect(economic(after)).toEqual(economic(before));
        expect(after.operations).toEqual([]);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
        expect(stripe.refunds).toEqual([]);
      });

      it("customer return keeps a discarded native draft in buyer history and replays its UUID without recreating it over HTTP", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPhysicalShipment: true,
        });
        const buyer = await storeContext();
        await assignCustomer(value, buyer.customerId);
        const path = `/store/orders/${value.orderId}/returns`;
        const body = customerReturn(value, 1);
        const initial = await api.post(path, body, { headers: buyer.headers });
        const returnId = (initial.data as CustomerReturnsResponse).requests[0]
          .id;
        const headers = {
          authorization: `Bearer ${await actorToken(value.actorId, "user")}`,
        };
        const before = await read(value);
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        await api.delete(`/admin/returns/${returnId}/request`, { headers });
        const discarded = await returnRows(value, true);
        expect(discarded).toHaveLength(1);
        expect(discarded[0].id).toBe(returnId);
        expect(
          "deleted_at" in discarded[0] && discarded[0].deleted_at,
        ).toBeTruthy();
        const history = await api.get(path, { headers: buyer.headers });
        expect(history.data).toMatchObject({
          eligibility: { allowed: true, reason: null },
          items: [{ available_quantity: 3 }],
          requests: [{ id: returnId, status: "canceled", destination: null }],
        });
        const replay = await api.post(path, body, { headers: buyer.headers });
        expect(replay.data).toEqual(history.data);
        expect(await returnRows(value, true)).toEqual(discarded);
        await api.post(
          path,
          { ...body, request_id: randomUUID() },
          { headers: buyer.headers },
        );
        const newRows = await returnRows(value, true);
        expect(newRows).toHaveLength(2);
        expect(newRows.find((row) => row.id === returnId)).toEqual(
          discarded[0],
        );
        const after = await read(value);
        for (const order of after.group.orders) {
          const original = before.group.orders.find(
            (row) => row.id === order.id,
          )!;
          expect(order.transactions).toEqual(original.transactions);
          expect(order.credit_lines).toEqual(original.credit_lines);
          expect(order.payment_collections).toEqual([]);
          expect(order.cart.payment_collection.payments).toEqual(
            original.cart.payment_collection.payments,
          );
        }
        expect(after.operations).toEqual([]);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
      });

      it("aftersales cancels an unshipped admin fulfillment through Mercur and restores Offer inventory and reservations without changing finance over HTTP", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPhysicalFulfillment: true,
        });
        const before = await read(value);
        const order = before.group.orders.find(
          (row) => row.id === value.orderId,
        )!;
        expect(order.fulfillments).toHaveLength(1);
        const fulfillmentId = order.fulfillments[0].id;
        expect(order.fulfillments[0].canceled_at).toBeNull();
        const { data: nativeFulfillments } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph(
            {
              entity: "fulfillment",
              fields: ["id", "shipped_at"],
              filters: { id: fulfillmentId },
            },
            { cache: { enable: false } },
          );
        expect(nativeFulfillments[0].shipped_at).toBeNull();
        const inventory = getContainer().resolve<IInventoryService>(
          Modules.INVENTORY,
        );
        const level = async () =>
          (
            await inventory.listInventoryLevels({
              inventory_item_id: value.inventoryItemId!,
              location_id: value.locationId!,
            })
          )[0];
        expect(financeAmount((await level()).stocked_quantity)).toBe(7);
        expect(
          await inventory.listReservationItems({ line_item_id: value.itemId }),
        ).toEqual([]);
        const headers = {
          authorization: `Bearer ${await actorToken(value.actorId, "user")}`,
        };
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        const path = `/admin/orders/${value.orderId}/fulfillments/${fulfillmentId}/cancel`;
        await api.post(path, { no_notification: true }, { headers });
        expect(financeAmount((await level()).stocked_quantity)).toBe(10);
        const reservations = await inventory.listReservationItems({
          line_item_id: value.itemId,
        });
        expect(reservations).toHaveLength(1);
        expect(reservations[0]).toMatchObject({
          inventory_item_id: value.inventoryItemId,
          location_id: value.locationId,
          quantity: 3,
        });
        const after = await read(value);
        const changed = after.group.orders.find(
          (row) => row.id === value.orderId,
        )!;
        expect(changed.fulfillments[0].canceled_at).not.toBeNull();
        expect(changed.items![0].detail.fulfilled_quantity).toBe(0);
        expect(changed.transactions).toEqual(order.transactions);
        expect(changed.credit_lines).toEqual(order.credit_lines);
        expect(changed.payment_collections).toEqual([]);
        expect(after.allocation).toEqual(before.allocation);
        expect(after.view.finance).toMatchObject({
          captured_total: 69,
          refunded_total: 0,
          refundable_total: 69,
        });
        expect(
          after.group.orders.find((row) => row.id === value.siblingOrderId),
        ).toEqual(
          before.group.orders.find((row) => row.id === value.siblingOrderId),
        );
        expect(
          (
            await api.post(
              path,
              { no_notification: true },
              { headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(400);
        expect(financeAmount((await level()).stocked_quantity)).toBe(10);
        expect(
          await inventory.listReservationItems({ line_item_id: value.itemId }),
        ).toEqual(reservations);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
      });

      it("aftersales blocks native returns before capture and while the shared financial group is fenced over HTTP", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          paymentState: "authorized",
        });
        const headers = {
          authorization: `Bearer ${await actorToken(value.actorId, "user")}`,
        };
        const attempt = () =>
          api.post(
            "/admin/returns",
            { order_id: value.orderId },
            { headers, validateStatus: () => true },
          );
        expect((await attempt()).status).toBe(400);
        expect(await returnRows(value)).toEqual([]);
        const writer = { group_id: value.groupId, cart_id: value.cartId };
        const { result: token } = await guardOrderFinanceWriterWorkflow(
          getContainer(),
        ).run({ input: { ...writer, action: "claim" } });
        try {
          expect((await attempt()).status).toBe(400);
          expect(await returnRows(value)).toEqual([]);
        } finally {
          await guardOrderFinanceWriterWorkflow(getContainer()).run({
            input: { ...writer, token, action: "finish" },
          });
        }
      });

      it("inspects without IO and refreshes persisted provider facts twice without changing economic effects", async () => {
        const value = await fixture();
        const before = await read(value);
        const request = {
          order_id: value.orderId,
          group_id: value.groupId,
          cart_id: value.cartId,
          actor_id: value.actorId,
          reason: "Refresh captured fixture observations without money writes",
        };
        const persistedFacts = async () => {
          const result = await dbConnection.raw(
            "select id, fact from finance_provider_fact where group_id = ? and mode = ? and deleted_at is null order by id",
            [value.groupId, mode],
          );
          return z
            .array(
              z.object({ id: z.string(), fact: providerFinanceFactSchema }),
            )
            .parse(result.rows);
        };
        const audit = async () => {
          const result = await dbConnection.raw(
            "select id, state, actor_id, reason, plan, final_result, finished_at from finance_recovery_attempt where group_id = ? and deleted_at is null order by id",
            [value.groupId],
          );
          return result.rows;
        };
        const operations = async () => {
          const result = await dbConnection.raw(
            "select id, state, token, result from commerce_operation where group_id = ? and deleted_at is null order by id",
            [value.groupId],
          );
          return result.rows;
        };
        expect(before.operations).toEqual([]);
        expect(await operations()).toEqual([]);
        expect(await persistedFacts()).toEqual([]);
        expect(await audit()).toEqual([]);
        const requestStart = stripe.requests.length;
        const inspection = await inspectOrderFinanceProviderFacts(
          getContainer(),
          request,
        );
        expect(inspection).toMatchObject({
          executed: false,
          provider_money_writes: false,
        });
        expect(inspection.sources.facts).toEqual([]);
        expect(stripe.requests).toHaveLength(requestStart);
        expect(await persistedFacts()).toEqual([]);
        expect(await audit()).toEqual([]);
        expect((await read(value)).state).toEqual(before.state);

        const providerPosts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        const factIds: string[][] = [];
        const attemptIds: string[] = [];
        for (const run of [1, 2]) {
          const { result } = await refreshOrderFinanceProviderFactsWorkflow(
            getContainer(),
          ).run({ input: request });
          expect(result).toMatchObject({
            executed: true,
            provider_money_writes: false,
          });
          attemptIds.push(result.attempt_id);
          expect(new Set(attemptIds).size).toBe(run);
          expect(result.sources.facts).toHaveLength(1);
          expect(result.sources.facts[0]).toMatchObject({
            mode,
            key: `stripe:${mode}:acct_durabilityplatform:capture:${value.chargeId}`,
            data_kind: livemode ? "ordinary" : "qa_fixture",
            kind: "capture",
            group_id: value.groupId,
            provider_id: value.chargeId,
            payment_intent_id: value.paymentIntentId,
            amount_minor: 10_000,
            balance_transaction_id: null,
          });
          expect(result.sources.costs).toEqual([]);
          expect(result.sources.coverage.complete).toBe(false);
          expect(result.sources.coverage.issues).toContainEqual({
            resource: result.sources.facts[0].key,
            reason: "cost_reference_missing",
          });
          const stored = await persistedFacts();
          expect(stored).toEqual(
            result.sources.facts.map((fact) => ({ id: fact.key, fact })),
          );
          factIds.push(stored.map((fact) => fact.id));
          expect(factIds[run - 1]).toEqual(factIds[0]);
          const attempts = await audit();
          expect(attempts).toHaveLength(run);
          expect(attempts).toEqual(
            expect.arrayContaining(
              attemptIds.map((id) =>
                expect.objectContaining({
                  id,
                  state: "complete",
                  actor_id: value.actorId,
                  reason: request.reason,
                  finished_at: expect.any(Date),
                  plan: expect.objectContaining({
                    action: "refresh_provider_observation",
                    provider_money_writes: false,
                  }),
                  final_result: expect.objectContaining({
                    executed: true,
                    provider_money_writes: false,
                  }),
                }),
              ),
            ),
          );
          expect(await operations()).toEqual([]);
          const after = await read(value);
          expect(after.originals).toEqual(before.originals);
          expect(after.group).toEqual(before.group);
          expect(after.operations).toEqual(before.operations);
          const fence = await dbConnection.raw(
            "select active_token, review_required, observation from commerce_group_state where id = ? and deleted_at is null",
            [value.groupId],
          );
          expect(fence.rows).toHaveLength(1);
          expect(fence.rows[0]).toMatchObject({
            active_token: null,
            review_required: false,
          });
          expect(
            readFinanceExecutionWriters(fence.rows[0].observation),
          ).toEqual([]);
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(providerPosts);
          expect(stripe.state).toMatchObject({
            captureCalls: 1,
            refundCreates: 0,
            reversalCreates: 0,
          });
          if (run === 1) {
            const oppositeMode = mode === "test" ? "live" : "test";
            const opposite = {
              ...result.sources.facts[0],
              key: result.sources.facts[0].key.replace(
                `stripe:${mode}:`,
                `stripe:${oppositeMode}:`,
              ),
              mode: oppositeMode,
              amount_minor: 9999,
              data_kind: oppositeMode === "test" ? "qa_fixture" : "ordinary",
            } as const;
            await journal().recordProviderObservation({
              facts: [opposite],
              costs: [],
              coverage: result.sources.coverage,
            });
            const readStart = stripe.requests.length;
            const local = await inspectOrderFinanceProviderFacts(
              getContainer(),
              request,
            );
            expect(local.sources.facts).toHaveLength(1);
            expect(local.sources.facts[0]).toMatchObject({
              mode,
              amount_minor: 10_000,
            });
            expect(stripe.requests).toHaveLength(readStart);
          }
        }
        const namespaces = await dbConnection.raw(
          "select mode, count(*)::integer as count from finance_provider_fact where group_id = ? and deleted_at is null group by mode order by mode",
          [value.groupId],
        );
        expect(namespaces.rows).toEqual([
          { mode: "live", count: 1 },
          { mode: "test", count: 1 },
        ]);
        expect(stripe.requests.slice(requestStart).length).toBeGreaterThan(0);
        expect(
          stripe.requests
            .slice(requestStart)
            .every((row) => row.method === "GET"),
        ).toBe(true);
      });

      it("rejects capture over HTTP when Stripe reports an expired authorization after native fulfillment", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          paymentState: "authorized",
        });
        const before = await read(value);
        expect(before.view.finance.capture).toMatchObject({
          allowed: true,
          amount: 100,
        });
        expect(
          before.group.orders.every((order) => order.fulfillments.length > 0),
        ).toBe(true);
        expect(before.operations).toEqual([]);
        const token = await actorToken(value.actorId, "user");

        // This models Stripe's observed expiration outcome, not elapsed real
        // authorization time. A fake clock alone cannot exercise this guard.
        expect(stripe.expireAuthorization()).toEqual({
          status: "canceled",
          amount_capturable: 0,
          amount_received: 0,
        });
        const requestStart = stripe.requests.length;
        const requestId = randomUUID();
        await expect(
          api.post(
            `/admin/orders/${value.orderId}/finance`,
            {
              action: "capture",
              request_id: requestId,
              note: "Observed expired authorization after fulfillment",
              confirm: true,
            },
            { headers: { authorization: `Bearer ${token}` } },
          ),
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: "La autorización no permite esta captura final." },
          },
        });
        const requests = stripe.requests.slice(requestStart);
        expect(requests).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              method: "GET",
              path: "/v1/payment_intents/pi_durability",
            }),
          ]),
        );
        expect(requests.filter((request) => request.method === "POST")).toEqual(
          [],
        );
        expect(stripe.state).toMatchObject({
          captureCalls: 0,
          refundCreates: 0,
          reversalCreates: 0,
        });
        const after = await read(value);
        expect(after.originals).toEqual(before.originals);
        expect(after.operations).toEqual([]);
        expect(after.state?.active_token).toBeNull();
        expect(after.state?.review_required).toBe(false);
        expect(after.view.finance.captured_total).toBe(0);
        for (const order of after.group.orders) {
          expect(order.transactions).toEqual([]);
          expect(order.cart.payment_collection.payments[0].captures).toEqual(
            [],
          );
          expect(order.cart.payment_collection.payments[0].refunds).toEqual([]);
        }
        const operations = await dbConnection.raw(
          "select id from commerce_operation where group_id = ? and deleted_at is null",
          [value.groupId],
        );
        expect(operations.rows).toEqual([]);
        const payouts = await dbConnection.raw(
          "select id from payout where deleted_at is null",
        );
        expect(payouts.rows).toEqual([]);
      });

      it("native split compatibility captures once, refunds the owning payment, and recovers a lost response", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          paymentState: "authorized",
        });
        await operateOrderFinanceWorkflow(getContainer()).run({
          input: {
            ...input(value),
            action: "capture",
            amount: undefined,
          },
        });
        const captured = await read(value);
        expect(captured.nativeSplit).toBe(true);
        expect(captured.financialProblem).toBeNull();
        expect(captured.refundPaymentId).not.toBe(value.paymentId);
        expect(captured.view.finance).toMatchObject({
          captured_total: 70,
          refundable_total: 70,
        });
        const sibling = await read(value, value.siblingOrderId);
        expect(sibling.refundPaymentId).not.toBe(captured.refundPaymentId);
        expect(sibling.view.finance).toMatchObject({
          captured_total: 30,
          refunded_total: 0,
        });
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const {
          data: [ownPayment],
        } = await query.graph(
          {
            entity: "payment",
            fields: ["id", "payment_collection.id"],
            filters: { id: captured.refundPaymentId! },
          },
          { cache: { enable: false } },
        );
        const headers = {
          authorization: `Bearer ${await actorToken(value.actorId, "user")}`,
        };
        const rejectNativeWrites = async () => {
          const effects = stripe.requests.filter(
            (row) => row.method === "POST",
          ).length;
          for (const path of [
            `/admin/payments/${captured.refundPaymentId}/refund`,
            `/admin/payments/${captured.refundPaymentId}/capture`,
            `/admin/payment-collections/${ownPayment.payment_collection.id}/mark-as-paid`,
          ]) {
            const response = await api.post(
              path,
              { amount: 1 },
              { headers, validateStatus: () => true },
            );
            expect(response.status).toBe(400);
            expect(response.data).toMatchObject({
              type: "not_allowed",
              message: path.endsWith("/capture")
                ? "Utiliza el panel financiero del pedido; esta ruta no permite el cobro compartido ni omitir una conciliación pendiente."
                : "Utiliza Cancelaciones y reembolsos desde el detalle del pedido para aplicar el importe de esta tienda.",
            });
          }
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(effects);
        };
        await rejectNativeWrites();
        stripe.state.loseRefundResponse = true;
        const request = input(value);
        await expect(operate(request)).rejects.toMatchObject({
          message: expect.any(String),
        });
        await rejectNativeWrites();
        stripe.state.loseRefundResponse = false;
        await recover(request);
        expect((await read(value)).view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 20,
          refundable_total: 50,
        });
        expect(
          (await read(value, value.siblingOrderId)).view.finance.refunded_total,
        ).toBe(0);
        expect(stripe.state).toMatchObject({
          captureCalls: 1,
          refundCreates: 1,
        });
        const { data: payments } = await query.graph(
          {
            entity: "payment",
            fields: ["id", "refunds.id"],
            filters: { id: [value.paymentId, captured.refundPaymentId!] },
          },
          { cache: { enable: false } },
        );
        expect(
          payments.find((payment) => payment.id === value.paymentId)?.refunds,
        ).toEqual([]);
        expect(
          payments.find((payment) => payment.id === captured.refundPaymentId)
            ?.refunds,
        ).toHaveLength(1);
        for (const fulfillment of (await read(value)).group.orders.find(
          (order) => order.id === value.orderId,
        )!.fulfillments) {
          if (!fulfillment.canceled_at)
            await cancelOrderFulfillmentWorkflow(getContainer()).run({
              input: {
                order_id: value.orderId,
                fulfillment_id: fulfillment.id,
                canceled_by: value.actorId,
              },
            });
        }
        stripe.state.expectedRefundAmount = 5_000;
        await operateOrderFinanceWorkflow(getContainer()).run({
          input: {
            ...input(value),
            action: "cancel",
            amount: undefined,
          },
        });
        expect((await read(value)).view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 70,
          refundable_total: 0,
        });
        expect(stripe.state).toMatchObject({
          captureCalls: 1,
          refundCreates: 2,
        });
        expect(
          (await read(value, value.siblingOrderId)).view.finance.refunded_total,
        ).toBe(0);
      });

      it("native split compatibility recovers the persisted boundary before transactions and completion flag without another provider capture", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          paymentState: "authorized",
        });
        const request = {
          ...input(value),
          action: "capture" as const,
          amount: undefined,
        };
        const service = journal();
        const observe = service.observeGroup.bind(service);
        const failure = jest
          .spyOn(service, "observeGroup")
          .mockImplementation(async (...args) => {
            if (args[2].finance_final_capture !== undefined)
              throw new Error("Injected final capture journal failure");
            return observe(...args);
          });
        try {
          await expect(
            operateOrderFinanceWorkflow(getContainer()).run({ input: request }),
          ).rejects.toMatchObject({ message: expect.any(String) });
        } finally {
          failure.mockRestore();
        }
        await drainNativeEvents();
        const captured = await read(value);
        const paymentModule = getContainer().resolve<IPaymentModuleService>(
          Modules.PAYMENT,
        );
        const orderModule = getContainer().resolve<IOrderModuleService>(
          Modules.ORDER,
        );
        const ownPaymentIds = [
          captured.refundPaymentId!,
          (await read(value, value.siblingOrderId)).refundPaymentId!,
        ];
        const ownCaptures = await paymentModule.listPayments(
          { id: ownPaymentIds },
          { relations: ["captures"] },
        );
        expect(ownCaptures).toHaveLength(2);
        expect(
          ownCaptures.every((payment) => payment.captures?.length === 1),
        ).toBe(true);
        // Fixture-only native writes restore the exact persisted split boundary:
        // captures exist, but order transactions and the final flag do not.
        const transactions = await orderModule.listOrderTransactions({
          order_id: [value.orderId, value.siblingOrderId],
          reference: "capture",
        });
        expect(transactions).toHaveLength(2);
        await orderModule.deleteOrderTransactions(
          transactions.map((transaction) => transaction.id),
        );
        const collection = captured.group.orders[0].cart.payment_collection;
        await paymentModule.updatePaymentCollections(collection.id, {
          metadata: { ...collection.metadata, split_order_collections: false },
        });
        const interrupted = await read(value);
        expect(interrupted.nativeSplit).toBe(true);
        expect(interrupted.financialProblem).toEqual(expect.any(String));
        expect(interrupted.view.finance.refund.allowed).toBe(false);
        const recovery = {
          order_id: value.orderId,
          actor_id: value.actorId,
          operation_id: `capture:${value.orderId}:${request.request_id}`,
          reason:
            "Restore recorded native captures after the interrupted split",
        };
        const inspected = await inspectFinanceRecovery(
          getContainer(),
          recovery,
        );
        expect(inspected.plan.actions).toContain("record_capture_transaction");
        const { result } = await recoverOrderFinanceWorkflow(
          getContainer(),
        ).run({
          input: {
            ...recovery,
            plan_hash: inspected.plan_hash,
            release_stopped_writer: false,
          },
        });
        expect(result).toMatchObject({
          state: "complete",
          fence_released: true,
        });
        const recovered = await read(value);
        expect(recovered.financialProblem).toBeNull();
        expect(recovered.view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 0,
        });
        expect(
          (await read(value, value.siblingOrderId)).view.finance,
        ).toMatchObject({ captured_total: 30, refunded_total: 0 });
        expect(
          (
            await paymentModule.listPayments(
              { id: ownPaymentIds },
              { relations: ["captures"] },
            )
          ).map((payment) => payment.captures?.map((capture) => capture.id)),
        ).toEqual(
          ownCaptures.map((payment) =>
            payment.captures?.map((capture) => capture.id),
          ),
        );
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        await splitCapturedCartPaymentWorkflow(getContainer()).run({
          input: { cart_id: value.cartId },
        });
        await operateOrderFinanceWorkflow(getContainer()).run({
          input: request,
        });
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
        expect(stripe.state).toMatchObject({
          captureCalls: 1,
          refundCreates: 0,
        });
      });

      it("native split compatibility preserves the reduced final capture after pre-capture cancellation", async () => {
        stripe.state.expectedCaptureAmount = 3_000;
        const value = await createFinanceDurabilityFixture(getContainer(), {
          paymentState: "authorized",
        });
        const current = await read(value);
        for (const fulfillment of current.group.orders.find(
          (order) => order.id === value.orderId,
        )!.fulfillments) {
          await cancelOrderFulfillmentWorkflow(getContainer()).run({
            input: {
              order_id: value.orderId,
              fulfillment_id: fulfillment.id,
              canceled_by: value.actorId,
            },
          });
        }
        await operateOrderFinanceWorkflow(getContainer()).run({
          input: {
            ...input(value),
            action: "cancel",
            amount: undefined,
          },
        });
        await operateOrderFinanceWorkflow(getContainer()).run({
          input: {
            ...input(value),
            order_id: value.siblingOrderId,
            action: "capture",
            amount: undefined,
          },
        });
        const sibling = await read(value, value.siblingOrderId);
        expect(sibling.nativeSplit).toBe(true);
        expect(sibling.financialProblem).toBeNull();
        expect(sibling.view.finance).toMatchObject({
          captured_total: 30,
          refunded_total: 0,
          refundable_total: 30,
        });
        expect((await read(value)).view.finance.captured_total).toBe(0);
        expect(stripe.state).toMatchObject({
          captureCalls: 1,
          refundCreates: 0,
        });
      });

      it("adopts a confirmed refund after its lost provider response removed the provisional native refund", async () => {
        const value = await fixture();
        const legacy = await read(value);
        const captureCalls = stripe.state.captureCalls;
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        const eventBus = getContainer().resolve<IEventBusModuleService>(
          Modules.EVENT_BUS,
        );
        for (let replay = 0; replay < 2; replay++) {
          await eventBus.emit({
            name: PaymentEvents.CAPTURED,
            data: { id: value.paymentId },
          });
          await drainNativeEvents();
          const observed = await read(value);
          expect(observed.nativeSplit).toBe(false);
          expect(observed.group).toEqual(legacy.group);
          expect(stripe.state).toMatchObject({
            captureCalls,
            refundCreates: 0,
          });
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(posts);
        }
        const request = input(value);
        stripe.state.loseRefundResponse = true;
        await expect(operate(request)).rejects.toMatchObject({
          message: expect.any(String),
        });
        stripe.state.loseRefundResponse = false;
        const persisted = await persistedOperation(request);
        expect(persisted).toMatchObject({
          state: "uncertain",
          result: { refund_attempted: true, refund_ids: [] },
        });
        expect(
          (await read(value)).group.orders[0].cart.payment_collection
            .payments[0].refunds,
        ).toHaveLength(0);
        expect(stripe.refunds).toHaveLength(1);
        await expect(operate(request)).rejects.toMatchObject({
          message: expect.any(String),
        });
        const inspection = await recover(request);
        expect(inspection.plan.actions).toContain("adopt_refund");
        await verifyCompleted(value, request);
      });

      it.each([
        ["before_cancel", false],
        ["after_cancel", false],
        ["after_complete", false],
        ["after_cancel", true],
      ] as const)(
        "recovers zero-amount cancellation after a total refund (%s, paid seller: %s) without another provider effect",
        async (boundary, withPayout) => {
          const value = await fixture(withPayout);
          stripe.state.expectedRefundAmount = 7_000;
          stripe.state.expectedReversalAmount = 6_440;
          await operate({ ...input(value), amount: 70 });
          const refunded = await read(value);
          expect(refunded.view.finance.cancellation).toMatchObject({
            allowed: true,
            refund_amount: 0,
          });
          const siblingBefore = refunded.group.orders.find(
            (order) => order.id === value.siblingOrderId,
          )!;
          const orderBefore = refunded.group.orders.find(
            (order) => order.id === value.orderId,
          )!;
          const request = {
            action: "cancel" as const,
            order_id: value.orderId,
            actor_id: value.actorId,
            request_id: randomUUID(),
            confirm: true as const,
            note: "Cancel a fully refunded order without another money movement",
          };
          const cancellationId = `cancel:${value.orderId}:${request.request_id}`;
          const service = journal();
          const orderModule = getContainer().resolve<IOrderModuleService>(
            Modules.ORDER,
          );
          const finish = service.finishOperation.bind(service);
          const failure =
            boundary === "before_cancel"
              ? jest
                  .spyOn(orderModule, "cancel")
                  .mockRejectedValueOnce(
                    new Error("Injected native cancellation failure"),
                  )
              : boundary === "after_complete"
                ? jest
                    .spyOn(service, "releaseGroup")
                    .mockRejectedValueOnce(
                      new Error("Injected cancellation fence-release failure"),
                    )
                : jest
                    .spyOn(service, "finishOperation")
                    .mockImplementation(async (...args) => {
                      if (
                        args[0] === cancellationId &&
                        args[2] === "complete"
                      ) {
                        throw new Error(
                          "Injected journal failure after native cancellation",
                        );
                      }
                      return finish(...args);
                    });
          const posts = stripe.requests.filter(
            (row) => row.method === "POST",
          ).length;
          try {
            await expect(
              operateOrderFinanceWorkflow(getContainer()).run({
                input: request,
              }),
            ).rejects.toMatchObject({ message: expect.any(String) });
          } finally {
            failure.mockRestore();
          }
          const recovery = {
            order_id: value.orderId,
            actor_id: value.actorId,
            operation_id: cancellationId,
            reason:
              "Recover native cancellation after the verified total refund",
          };
          const before = await read(value);
          const operation = before.operations.find(
            (item) => item.id === cancellationId,
          )!;
          expect(operation.state).toBe(
            boundary === "after_complete" ? "complete" : "uncertain",
          );
          expect(before.state?.active_token).toBe(operation.token);
          const inspected = await inspectFinanceRecovery(
            getContainer(),
            recovery,
          );
          expect(inspected.prepared.kind).toBe("cancellation");
          expect(inspected.plan.actions).toEqual(
            boundary === "before_cancel" ? ["cancel_order"] : [],
          );
          const { result } = await recoverOrderFinanceWorkflow(
            getContainer(),
          ).run({
            input: {
              ...recovery,
              plan_hash: inspected.plan_hash,
              release_stopped_writer: false,
            },
          });
          expect(result).toMatchObject({
            state: "complete",
            fence_released: true,
          });
          const after = await read(value);
          const orderAfter = after.group.orders.find(
            (order) => order.id === value.orderId,
          )!;
          expect(orderAfter.status).toBe("canceled");
          expect(orderAfter.transactions).toEqual(orderBefore.transactions);
          const refundCredits = (order: typeof orderAfter) =>
            order.credit_lines
              ?.filter((line) => line.reference === "refund")
              .map(({ amount, reference, reference_id }) => ({
                amount,
                reference,
                reference_id,
              }));
          expect(refundCredits(orderAfter)).toEqual(refundCredits(orderBefore));
          expect(
            orderAfter.credit_lines
              ?.filter((line) => line.reference !== "refund")
              .every((line) => MathBN.eq(line.amount, 0)),
          ).toBe(true);
          expect(orderAfter.payment_collections).toEqual([]);
          expect(
            after.group.orders.find(
              (order) => order.id === value.siblingOrderId,
            ),
          ).toEqual(siblingBefore);
          expect(after.state?.active_token).toBeNull();
          expect(after.state?.review_required).toBe(false);
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(posts);
          expect(stripe.state.refundCreates).toBe(1);
          expect(stripe.state.reversalCreates).toBe(withPayout ? 1 : 0);
          expect(
            after.operations.find((item) => item.id === cancellationId)?.result,
          ).toEqual(operation.result);
        },
      );

      it.each(["refund", "reversal"] as const)(
        "recovers the %s effect before the journal checkpoint without repeating it",
        async (kind) => {
          const value = await fixture(kind === "reversal");
          const request = input(value);
          const restore = failJournalAfterEffect(kind);
          try {
            await expect(operate(request)).rejects.toMatchObject({
              message: expect.any(String),
            });
          } finally {
            restore();
          }
          const persisted = await persistedOperation(request);
          expect(persisted.state).toBe("processing");
          expect(persisted.result.refund_ids).toEqual([]);
          expect(persisted.result.settlement?.reversal_id).toBeUndefined();
          expect((await read(value)).state?.active_token).toBe(persisted.token);
          expect(stripe.state.refundCreates).toBe(kind === "refund" ? 1 : 0);
          expect(stripe.state.reversalCreates).toBe(
            kind === "reversal" ? 1 : 0,
          );
          await expect(operate(request)).rejects.toMatchObject({
            message: expect.any(String),
          });
          const inspection = await recover(request);
          expect(inspection.plan.actions).toContain(
            kind === "refund" ? "record_refund_transaction" : "create_refund",
          );
          if (kind === "refund")
            expect(inspection.plan.actions).not.toContain("adopt_refund");
          await verifyCompleted(value, request, kind === "reversal");
        },
      );

      it.each(["refund", "reversal"] as const)(
        "keeps the fence and refuses recovery when the attempted %s is absent from observation",
        async (kind) => {
          const value = await fixture(kind === "reversal");
          const request = input(value);
          if (kind === "refund") stripe.state.loseRefundResponse = true;
          else stripe.state.loseReversalResponse = true;
          await expect(operate(request)).rejects.toMatchObject({
            message: expect.any(String),
          });
          stripe.state.loseRefundResponse = false;
          stripe.state.loseReversalResponse = false;
          stripe.state.hideRefunds = kind === "refund";
          stripe.state.hideReversals = kind === "reversal";
          const before = await persistedOperation(request);
          expect(before.state).toBe("uncertain");
          const posts = stripe.requests.filter(
            (row) => row.method === "POST",
          ).length;
          await expect(
            inspectFinanceRecovery(getContainer(), recoveryInput(request)),
          ).rejects.toMatchObject({ message: expect.any(String) });
          await expect(
            recoverOrderFinanceWorkflow(getContainer()).run({
              input: {
                ...recoveryInput(request),
                plan_hash: "0".repeat(64),
                release_stopped_writer: false,
              },
            }),
          ).rejects.toMatchObject({ message: expect.any(String) });
          await expect(operate(request)).rejects.toMatchObject({
            message: expect.any(String),
          });
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(posts);
          expect(await persistedOperation(request)).toEqual(before);
          const current = await read(value);
          expect(current.state).toMatchObject({
            active_token: before.token,
            review_required: true,
          });
          expect(current.view.finance.refund.allowed).toBe(false);
          expect(
            await journal().listFinanceRecoveryAttempts({
              operation_id: operationId(request),
            }),
          ).toEqual([]);
        },
      );

      it.each([false, true])(
        "replays a persisted success after response loss (fence already released: %s)",
        async (released) => {
          const value = await fixture();
          const request = input(value);
          const service = journal();
          const release = service.releaseGroup.bind(service);
          const spy = jest
            .spyOn(service, "releaseGroup")
            .mockImplementation(async (...args) => {
              if (released) await release(...args);
              throw new Error(
                "Injected response loss after durable complete operation",
              );
            });
          try {
            await expect(operate(request)).rejects.toMatchObject({
              message: expect.any(String),
            });
          } finally {
            spy.mockRestore();
          }
          const before = await persistedOperation(request);
          expect(before.state).toBe("complete");
          expect(stripe.state.refundCreates).toBe(1);
          if (!released) {
            expect((await read(value)).state?.active_token).toBe(before.token);
            const inspection = await recover(request);
            expect(inspection.plan.actions).toEqual([]);
            expect((await persistedOperation(request)).result).toEqual(
              before.result,
            );
          }
          await verifyCompleted(value, request);
        },
      );
    },
  });
}
