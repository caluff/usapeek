import type { ExecArgs, LinkDefinition } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  authorizePaymentSessionStep,
  capturePaymentStep,
  createCartsStep,
  createOrdersWorkflow,
  createPaymentCollectionsStep,
  createPaymentSessionsWorkflow,
  createRemoteLinkStep,
  updateCartsStep,
} from "@medusajs/core-flows";
import {
  createOrderGroupStep,
  createSellersStep,
} from "@mercurjs/core/workflows";
import { MercurModules, SellerStatus } from "@mercurjs/types";
import { createStripeClient } from "../lib/stripe-client";
import { getStripeConnectConfiguration } from "../lib/stripe-connect-configuration";

const QA_TAG = "order-finance-2026-09-12";
const qaFinanceSellerWorkflow = createWorkflow("qa-finance-seller", function () {
  return new WorkflowResponse(
    createSellersStep([
      {
        name: "QA · Reembolsos multitienda",
        handle: QA_TAG,
        email: "order-finance-qa@example.com",
        currency_code: "usd",
        status: SellerStatus.PENDING_APPROVAL,
      },
    ]),
  );
});
const qaFinanceOrdersWorkflow = createWorkflow(
  "qa-finance-orders",
  function (input: {
    region_id: string;
    customer_id: string;
    email: string;
    seller_ids: string[];
    scenario: string;
  }) {
    const carts = createCartsStep([
      {
        currency_code: "usd",
        region_id: input.region_id,
        customer_id: input.customer_id,
        email: input.email,
        metadata: { qa: QA_TAG, scenario: input.scenario },
      },
    ]);
    const collections = createPaymentCollectionsStep([
      {
        currency_code: "usd",
        amount: 34,
        metadata: { qa: QA_TAG, scenario: input.scenario },
      },
    ]);
    const group = createOrderGroupStep({
      cart_id: carts[0].id,
      customer_id: input.customer_id,
    });
    const firstInput = transform({ input }, ({ input }) => ({
      region_id: input.region_id,
      currency_code: "usd",
      customer_id: input.customer_id,
      email: input.email,
      metadata: { qa: QA_TAG, scenario: input.scenario },
      items: [
        {
          title: `QA ${input.scenario} · Tienda A`,
          quantity: 1,
          unit_price: 10,
          requires_shipping: false,
        },
      ],
      shipping_methods: [{ name: "QA entrega A", amount: 2 }],
    }));
    const first = createOrdersWorkflow.runAsStep({ input: firstInput });
    const secondInput = transform(
      { firstInput, input },
      ({ firstInput, input }) => ({
        ...firstInput,
        items: [
          {
            title: `QA ${input.scenario} · Tienda B`,
            quantity: 1,
            unit_price: 20,
            requires_shipping: false,
          },
        ],
        shipping_methods: [{ name: "QA entrega B", amount: 2 }],
      }),
    );
    const second = createOrdersWorkflow
      .runAsStep({ input: secondInput })
      .config({ name: "qa-second-order" });
    const links = transform(
      { carts, collections, group, first, second, input },
      ({
        carts,
        collections,
        group,
        first,
        second,
        input,
      }): LinkDefinition[] => [
        {
          [Modules.CART]: { cart_id: carts[0].id },
          [Modules.PAYMENT]: { payment_collection_id: collections[0].id },
        },
        ...[first, second].flatMap((order, index): LinkDefinition[] => [
          {
            [Modules.ORDER]: { order_id: order.id },
            [Modules.CART]: { cart_id: carts[0].id },
          },
          {
            [Modules.ORDER]: { order_id: order.id },
            [MercurModules.SELLER]: { seller_id: input.seller_ids[index] },
          },
          {
            [MercurModules.SELLER]: { order_group_id: group.id },
            [Modules.ORDER]: { order_id: order.id },
          },
        ]),
      ],
    );
    createRemoteLinkStep(links);
    const completed = transform({ carts }, ({ carts }) => [
      { id: carts[0].id, completed_at: new Date() },
    ]);
    updateCartsStep(completed);
    return new WorkflowResponse({
      order_ids: [first.id, second.id],
      collection_id: collections[0].id,
      group_id: group.id,
    });
  },
);
const qaFinanceAuthorizeWorkflow = createWorkflow(
  "qa-finance-authorize",
  function (input: { session_id: string }) {
    return new WorkflowResponse(
      authorizePaymentSessionStep({ id: input.session_id }),
    );
  },
);
const qaFinanceCaptureWorkflow = createWorkflow(
  "qa-finance-capture",
  function (input: { payment_id: string }) {
    return new WorkflowResponse(
      capturePaymentStep({ payment_id: input.payment_id, amount: 34 }),
    );
  },
);

/** Explicit test fixtures for finance QA, not an alternative checkout or a production seeder. */
export default async function seedOrderFinanceQa({
  container,
  args,
}: ExecArgs) {
  const scenario = args[0];
  if (
    !scenario ||
    !["authorized", "captured"].includes(scenario) ||
    process.env.NODE_ENV === "production"
  )
    throw new Error("Use authorized or captured in development only.");
  const configuration = getStripeConnectConfiguration();
  if (!configuration || configuration.jobsEnabled)
    throw new Error("QA requires test Stripe and disabled automatic payouts.");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [
    { data: regions },
    { data: customers },
    { data: sellers },
    { data: qaSellers },
    { data: existing },
  ] = await Promise.all([
    query.graph({
      entity: "region",
      fields: ["id"],
      filters: { currency_code: "usd" },
    }),
    query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: { email: "caluffdaniel@gmail.com" },
    }),
    query.graph({
      entity: "seller",
      fields: ["id"],
      filters: { id: "sel_01M1SJQH2N0X7K3TG29TEY48EC" },
    }),
    query.graph({
      entity: "seller",
      fields: ["id"],
      filters: { handle: QA_TAG },
    }),
    query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      pagination: { take: 100, order: { created_at: "DESC" } },
    }),
  ]);
  if (!regions[0] || customers.length !== 1 || sellers.length !== 1)
    throw new Error("The designated QA region/customer/seller is unavailable.");
  if (
    existing.some(
      (order) =>
        order.metadata?.qa === QA_TAG && order.metadata?.scenario === scenario,
    )
  )
    throw new Error(
      "QA scenario already exists. Inspect existing fixtures; do not duplicate payments.",
    );
  const secondSeller =
    qaSellers[0] ?? (await qaFinanceSellerWorkflow(container).run()).result[0];
  const { result } = await qaFinanceOrdersWorkflow(container).run({
    input: {
      region_id: regions[0].id,
      customer_id: customers[0].id,
      email: customers[0].email!,
      seller_ids: [sellers[0].id, secondSeller.id],
      scenario,
    },
  });
  // Log only durable fixture IDs, so any interrupted setup can be inspected without repeating it.
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  logger.info(`QA fixtures created: ${JSON.stringify(result)}`);
  const { result: session } = await createPaymentSessionsWorkflow(
    container,
  ).run({
    input: {
      payment_collection_id: result.collection_id,
      provider_id: "pp_stripe_stripe",
      data: { metadata: { qa: QA_TAG, scenario } },
    },
  });
  const intentId = session.data?.id;
  if (typeof intentId !== "string")
    throw new Error("Native payment session did not return a payment intent.");
  const stripe = createStripeClient(configuration.apiKey);
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.livemode || intent.amount !== 3400 || intent.currency !== "usd")
    throw new Error("Unexpected QA payment intent.");
  await stripe.paymentIntents.confirm(
    intent.id,
    {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/account/orders",
    },
    { idempotencyKey: `${QA_TAG}:${scenario}:confirm` },
  );
  const { result: payment } = await qaFinanceAuthorizeWorkflow(container).run({
    input: { session_id: session.id },
  });
  if (!payment) throw new Error("The test payment was not authorized.");
  if (scenario === "captured")
    await qaFinanceCaptureWorkflow(container).run({
      input: { payment_id: payment.id },
    });
  logger.info(
    `QA ${scenario} ready: ${JSON.stringify({ ...result, payment_id: payment.id })}`,
  );
}
