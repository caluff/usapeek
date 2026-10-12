import { mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExecArgs, LinkDefinition } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  authorizePaymentSessionStep,
  cancelOrderWorkflow,
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
  createOrderFulfillmentWorkflow,
  createCommissionRatesWorkflow,
  upsertCommissionLinesStep,
  createPayoutStep,
} from "@mercurjs/core/workflows";
import {
  MercurModules,
  CommissionRateType,
  PayoutAccountStatus,
} from "@mercurjs/types";
import { createStripeClient } from "../lib/stripe-client";
import { getStripeConnectConfiguration } from "../lib/stripe-connect-configuration";
import { requireSellerWarehouse } from "../lib/vendor-warehouse/access";

const QA_TAG = "order-finance-extension-2026-09-12";
const STORE_A = "sel_01M1SJQH2N0X7K3TG29TEY48EC";
const INSPECTED_UNPAID_FIXTURES = {
  reduced: {
    order_ids: [
      "order_01M2BSAKW2C49RGPZE3Q3N7C5N",
      "order_01M2BSAT4C3P8RHE3E62DACKPA",
    ],
    collection_id: "pay_col_01M2BSAH2R7NCTW35NFP4B6P4E",
    group_id: "og_01M2BSAHVEXKVWPQJMT319ZNX8",
    cart_id: "cart_01M2BSAG31WE3A3D0H67QKQ8VP",
  },
  paid: {
    order_ids: [
      "order_01M2BSF13DED9M2EHPFEM3PVCJ",
      "order_01M2BSF7F2AQ6PFAS4M89C303V",
    ],
    collection_id: "pay_col_01M2BSEY6DCH1TYZE7V2GYZ8SD",
    group_id: "og_01M2BSEYZ65KJH9N21WTPX16N5",
    cart_id: "cart_01M2BSEX6CFQAJTTPZF0GHRXQ0",
  },
};
const qaFinanceExtensionOrdersWorkflow = createWorkflow(
  "qa-finance-extension-orders",
  function (input: {
    region_id: string;
    customer_id: string;
    shipping_option_id: string;
    shipping_option_name: string;
    seller_ids: string[];
    scenario: string;
  }) {
    const carts = createCartsStep([
      {
        currency_code: "usd",
        region_id: input.region_id,
        customer_id: input.customer_id,

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
      no_notification: true,
      metadata: { qa: QA_TAG, scenario: input.scenario },
      items: [
        {
          title: `QA ${input.scenario} · Tienda A`,
          quantity: 1,
          unit_price: 10,
          requires_shipping: true,
        },
      ],
      shipping_methods: [
        {
          name: input.shipping_option_name,
          shipping_option_id: input.shipping_option_id,
          amount: 2,
          data: {},
        },
      ],
      shipping_address: {
        first_name: "QA",
        last_name: "Finance",
        address_1: "QA test fixture",
        city: "New York",
        province: "NY",
        postal_code: "10001",
        country_code: "us",
      },
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
      cart_id: carts[0].id,
    });
  },
);
const qaFinanceExtensionAuthorizeWorkflow = createWorkflow(
  "qa-finance-extension-authorize",
  function (input: { session_id: string }) {
    return new WorkflowResponse(
      authorizePaymentSessionStep({ id: input.session_id }),
    );
  },
);
const qaFinanceExtensionCaptureWorkflow = createWorkflow(
  "qa-finance-extension-capture",
  function (input: { payment_id: string }) {
    return new WorkflowResponse(
      capturePaymentStep({ payment_id: input.payment_id, amount: 34 }),
    );
  },
);

const qaFinanceExtensionCommissionWorkflow = createWorkflow(
  "qa-finance-extension-commission",
  function (input: { item_id: string; commission_rate_id: string }) {
    return new WorkflowResponse(
      upsertCommissionLinesStep({
        commission_lines: [
          {
            item_id: input.item_id,
            commission_rate_id: input.commission_rate_id,
            code: QA_TAG,
            rate: 12,
            amount: 1.2,
            description: "Isolated QA commission: 1.2 of gross 12",
          },
        ],
      }),
    );
  },
);

// The native workflow does not expose source_transaction. Compose its native
// provider step and links here so the test charge can fund pending Stripe balance.
const qaFinanceExtensionPayoutWorkflow = createWorkflow(
  "qa-finance-extension-payout",
  function (input: {
    order_id: string;
    account_id: string;
    source_transaction: string;
    amount: number;
  }) {
    const payout = createPayoutStep({
      account_id: input.account_id,
      amount: input.amount,
      currency_code: "usd",
      data: {
        order_id: input.order_id,
        seller_id: STORE_A,
        source_transaction: input.source_transaction,
        metadata: { qa: QA_TAG, scenario: "paid" },
      },
      context: { idempotency_key: input.order_id },
    });
    createRemoteLinkStep([
      {
        [MercurModules.PAYOUT]: { payout_id: payout.id },
        [MercurModules.SELLER]: { seller_id: STORE_A },
      },
    ]);
    return new WorkflowResponse(payout);
  },
);

/** Explicit, single-use test setup. Never run automatically or resume blindly. */
export default async function seedOrderFinanceExtensionQa({
  container,
  args,
}: ExecArgs) {
  const scenario = args[0];
  const resumeUnpaid = args.length === 2 && args[1] === "resume-unpaid";
  if (
    (args.length !== 1 && !resumeUnpaid) ||
    !["reduced", "paid", "reduced-ui"].includes(scenario) ||
    (resumeUnpaid && scenario === "reduced-ui") ||
    process.env.NODE_ENV !== "development"
  )
    throw new Error(
      "Supply exactly reduced or paid, with NODE_ENV=development.",
    );
  const configuration = getStripeConnectConfiguration();
  if (!configuration || configuration.jobsEnabled)
    throw new Error(
      "QA requires configured sk_test Stripe and disabled automatic jobs.",
    );
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const inspected =
    INSPECTED_UNPAID_FIXTURES[
      scenario as keyof typeof INSPECTED_UNPAID_FIXTURES
    ];
  if (resumeUnpaid) {
    const { data } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "metadata",
        "payment_collection.id",
        "payment_collection.payments.id",
        "payment_collection.payment_sessions.id",
      ],
      filters: { id: inspected.cart_id },
    });
    const cart = data[0];
    if (
      !cart ||
      cart.metadata?.qa !== QA_TAG ||
      cart.metadata?.scenario !== scenario ||
      cart.payment_collection?.id !== inspected.collection_id ||
      cart.payment_collection.payments?.length ||
      cart.payment_collection.payment_sessions?.length
    )
      throw new Error(
        "Resume is limited to the inspected unpaid fixture with no sessions or payments.",
      );
  }

  // Scan every cart, including incomplete setups, rather than only recent orders.
  for (let skip = 0; ; skip += 100) {
    const { data } = await query.graph({
      entity: "cart",
      fields: ["id", "metadata"],
      pagination: { take: 100, skip, order: { id: "ASC" } },
    });
    if (
      data.some(
        (cart) =>
          cart.metadata?.qa === QA_TAG &&
          cart.metadata?.scenario === scenario &&
          !(resumeUnpaid && cart.id === inspected.cart_id),
      )
    )
      throw new Error(
        "This fixture already exists or setup was interrupted; inspect it before any retry.",
      );
    if (data.length < 100) break;
  }
  const [
    { data: regions },
    { data: customers },
    { data: sellers },
    { data: qaSellers },
  ] = await Promise.all([
    query.graph({
      entity: "region",
      fields: ["id"],
      filters: { currency_code: "usd" },
    }),
    query.graph({
      entity: "customer",
      fields: ["id"],
      filters: { email: "caluffdaniel@gmail.com" },
    }),
    query.graph({
      entity: "seller",
      fields: [
        "id",
        "payout_account.id",
        "payout_account.status",
        "payout_account.data",
      ],
      filters: { id: STORE_A },
    }),
    query.graph({
      entity: "seller",
      fields: ["id"],
      filters: { handle: "order-finance-2026-09-12" },
    }),
  ]);
  if (
    regions.length !== 1 ||
    customers.length !== 1 ||
    sellers.length !== 1 ||
    qaSellers.length !== 1
  )
    throw new Error(
      "Expected one existing USD region, designated customer/store A, and original QA seller.",
    );
  const locationId = await requireSellerWarehouse(container, STORE_A);
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "fulfillment_sets.service_zones.shipping_options.id",
      "fulfillment_sets.service_zones.shipping_options.name",
      "fulfillment_sets.service_zones.shipping_options.provider_id",
    ],
    filters: { id: locationId },
  });
  const options =
    locations[0]?.fulfillment_sets?.flatMap(
      (set) =>
        set?.service_zones?.flatMap((zone) => zone.shipping_options ?? []) ??
        [],
    ) ?? [];
  // Manual fulfillment has no external shipment purchase side effect.
  const option = options.find(
    (option) => option.provider_id === "manual_manual",
  );
  if (!option)
    throw new Error(
      "Store A has no existing manual shipping option in its assigned warehouse.",
    );

  const stripe = createStripeClient(configuration.apiKey);
  const payoutAccount = sellers[0].payout_account;
  const connectedId = payoutAccount?.data?.id;
  if (scenario === "paid") {
    if (
      !payoutAccount ||
      payoutAccount.status !== PayoutAccountStatus.ACTIVE ||
      typeof connectedId !== "string" ||
      !connectedId.startsWith("acct_")
    )
      throw new Error(
        "BLOCKED: Store A needs an existing active native TEST payout account; do not activate or onboard it in this script.",
      );
    // Match the installed native provider / Stripe 15 contract. The test-key
    // scoped balance read explicitly verifies the connected account's test mode.
    const [account, balance] = await Promise.all([
      stripe.accounts.retrieve(connectedId),
      stripe.balance.retrieve({}, { stripeAccount: connectedId }),
    ]);
    if (
      balance.livemode ||
      !account.details_submitted ||
      !account.payouts_enabled ||
      account.capabilities?.transfers !== "active" ||
      account.requirements?.disabled_reason ||
      account.requirements?.currently_due?.length ||
      account.requirements?.past_due?.length ||
      account.requirements?.pending_verification?.length
    )
      throw new Error(
        "BLOCKED: Existing connected TEST account is not verified and transfer-ready.",
      );
  }

  // Exclusive, durable local marker also blocks simultaneous runs and retries
  // after native compensation removed a cart. Deliberately retained on failure.
  const guardDirectory = resolve(process.cwd(), ".medusa", "qa-fixture-guards");
  await mkdir(guardDirectory, { recursive: true });
  const guard = await open(
    resolve(
      guardDirectory,
      `${QA_TAG}-${scenario}${resumeUnpaid ? "-resume-unpaid" : ""}.json`,
    ),
    "wx",
  );
  await guard.writeFile(
    JSON.stringify({ qa: QA_TAG, scenario, status: "started" }),
  );
  await guard.close();

  const result = resumeUnpaid
    ? inspected
    : (
        await qaFinanceExtensionOrdersWorkflow(container).run({
          input: {
            region_id: regions[0].id,
            customer_id: customers[0].id,
            seller_ids: [STORE_A, qaSellers[0].id],
            scenario,
            shipping_option_id: option.id,
            shipping_option_name: option.name,
          },
        })
      ).result;
  logger.info(`QA extension fixtures created: ${JSON.stringify(result)}`);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "total",
      "version",
      "items.*",
      "items.detail.*",
      "items.tax_lines.*",
      "items.adjustments.*",
      "shipping_methods.*",
      "shipping_methods.tax_lines.*",
      "shipping_methods.adjustments.*",
      "credit_lines.*",
    ],
    filters: { id: result.order_ids },
  });
  const first = orders.find((order) => order.id === result.order_ids[0]);
  const second = orders.find((order) => order.id === result.order_ids[1]);
  if (
    !first ||
    !second ||
    Number(first.total) !== 12 ||
    Number(second.total) !== 22 ||
    first.items?.length !== 1
  )
    throw new Error(
      "Fixture totals or items differ from the expected 12 + 22.",
    );

  const firstItems = first.items.filter((item) => item !== null);
  if (firstItems.length !== 1)
    throw new Error("Expected one non-null QA item.");
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
    throw new Error("Native payment session did not return a PaymentIntent.");
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (
    intent.livemode ||
    intent.amount !== 3400 ||
    intent.currency !== "usd" ||
    intent.capture_method !== "manual"
  )
    throw new Error(
      "Unexpected TEST payment intent amount, currency, or capture mode.",
    );
  await stripe.paymentIntents.confirm(
    intent.id,
    {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/account/orders",
    },
    { idempotencyKey: `${QA_TAG}:${scenario}:confirm` },
  );
  const { result: payment } = await qaFinanceExtensionAuthorizeWorkflow(
    container,
  ).run({
    input: { session_id: session.id },
  });
  if (!payment) throw new Error("TEST payment was not authorized.");

  let fulfillmentId: string | undefined;
  let payoutId: string | undefined;
  let transferId: string | undefined;
  if (scenario !== "paid") {
    const { result: fulfillment } = await createOrderFulfillmentWorkflow(
      container,
    ).run({
      input: {
        order_id: first.id,
        location_id: locationId,
        shipping_option_id: option.id,
        items: firstItems.map((item) => ({
          id: item.id,
          quantity: Number(item.quantity),
        })),
        no_notification: true,
      },
    });
    fulfillmentId = fulfillment.id;
    if (scenario === "reduced-ui") {
      await cancelOrderWorkflow(container).run({
        input: { order_id: second.id },
      });
    }
  } else {
    const { result: rates } = await createCommissionRatesWorkflow(
      container,
    ).run({
      input: [
        {
          name: QA_TAG,
          code: QA_TAG,
          type: CommissionRateType.PERCENTAGE,
          value: 12,
          is_enabled: false,
          is_default: false,
          include_shipping: false,
          include_tax: false,
        },
      ],
    });
    await qaFinanceExtensionCommissionWorkflow(container).run({
      input: { item_id: firstItems[0].id, commission_rate_id: rates[0].id },
    });
    const { data: lines } = await query.graph({
      entity: "commission_line",
      fields: ["amount"],
      filters: {
        $or: [
          { item_id: firstItems.map((item) => item.id) },
          {
            shipping_method_id:
              first.shipping_methods?.flatMap((method) =>
                method ? [method.id] : [],
              ) ?? [],
          },
        ],
      },
    });
    const commission = lines.reduce(
      (sum, line) => sum + Number(line.amount),
      0,
    );
    if (Math.abs(commission - 1.2) > 0.000001)
      throw new Error(
        "Native commission must total exactly 1.2 before capture and transfer.",
      );
    await qaFinanceExtensionCaptureWorkflow(container).run({
      input: { payment_id: payment.id },
    });
    const captured = await stripe.paymentIntents.retrieve(intent.id);
    const chargeId =
      typeof captured.latest_charge === "string"
        ? captured.latest_charge
        : captured.latest_charge?.id;
    if (
      captured.livemode ||
      captured.status !== "succeeded" ||
      captured.amount_received !== 3400 ||
      !chargeId
    )
      throw new Error(
        "Expected fully captured TEST 34 and original Stripe charge.",
      );
    const { result: payout } = await qaFinanceExtensionPayoutWorkflow(container).run({
      input: {
        order_id: first.id,
        account_id: payoutAccount!.id,
        source_transaction: chargeId,
        amount: Math.round((Number(first.total) - commission) * 100) / 100,
      },
    });
    payoutId = payout.id;
    transferId =
      typeof payout.data?.id === "string" ? payout.data.id : undefined;
    if (!transferId)
      throw new Error("Native payout did not return a Stripe transfer.");
    const transfer = await stripe.transfers.retrieve(transferId);
    if (
      transfer.livemode ||
      transfer.amount !== 1080 ||
      transfer.currency !== "usd" ||
      transfer.destination !== connectedId ||
      transfer.source_transaction !== chargeId
    )
      throw new Error(
        "Unexpected native TEST transfer; inspect the fixture and do not rerun.",
      );
  }
  logger.info(
    `QA extension ${scenario} ready: ${JSON.stringify({
      ...result,
      payment_id: payment.id,
      payment_intent_id: intent.id,
      fulfillment_id: fulfillmentId,
      payout_id: payoutId,
      transfer_id: transferId,
    })}`,
  );
}
