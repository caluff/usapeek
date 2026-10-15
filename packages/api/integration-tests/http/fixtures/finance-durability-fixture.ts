import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  authorizePaymentSessionStep,
  createLinksWorkflow,
  createOrderShipmentWorkflow,
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createUsersWorkflow,
} from "@medusajs/core-flows";
import type {
  ICartModuleService,
  IFulfillmentModuleService,
  IInventoryService,
  IOrderModuleService,
  IPaymentModuleService,
  IProductModuleService,
  IRbacModuleService,
  LinkDefinition,
  MedusaContainer,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  Modules,
  PolicyOperation,
} from "@medusajs/framework/utils";
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import type OfferModule from "@mercurjs/core/modules/offer";
import type PayoutModule from "@mercurjs/core/modules/payout";
import type SellerModule from "@mercurjs/core/modules/seller";
import {
  batchOfferInventoryItemsWorkflow,
  createCommissionRatesWorkflow,
  createOrderFulfillmentWorkflow,
  updateCommissionRatesWorkflow,
} from "@mercurjs/core/workflows";
import {
  CommissionRateType,
  MercurModules,
  PayoutAccountStatus,
  PayoutStatus,
} from "@mercurjs/types";
import { readOrderFinance } from "../../../src/lib/order-finance/read";
import { requireFinanceOperator } from "../../../src/lib/order-finance/settlement-plan";
import type CommissionModuleService from "../../../src/modules/commission/service";
import { freezeOriginalSaleWorkflow } from "../../../src/workflows/freeze-original-sale";
import {
  recordAllocatedRefundWorkflow,
  recordFinalCaptureWorkflow,
} from "../../../src/workflows/order-finance-native";
import { recordReconciledPayoutWorkflow } from "../../../src/workflows/recovery-native";
import { linkSettlementPayoutWorkflow } from "../../../src/workflows/settlement-native";
import { onboardingService } from "../../../src/lib/vendor-onboarding/access";

const authorizeFixturePaymentWorkflow = createWorkflow(
  "authorize-finance-durability-fixture-payment",
  function (input: { id: string }) {
    return new WorkflowResponse(authorizePaymentSessionStep(input));
  },
);

/**
 * Call only from the guarded disposable integration runner with its Stripe
 * transport already installed. Fixture CRUD creates the real linked graph;
 * original-sale, authorization, capture and transaction workflows stay native.
 * The authorized variant fulfills both orders with the native manual provider,
 * leaving the shared payment uncaptured and eligible for the admin capture route.
 * The optional payout represents an existing simulated transfer. The caller
 * must seed that same transfer in its independent provider ledger after return.
 */
export async function createFinanceDurabilityFixture(
  container: MedusaContainer,
  {
    withPayout = false,
    withPayoutAccount = false,
    paymentState = "captured",
    withPhysicalShipment = false,
    withPhysicalFulfillment = false,
    livemode = false,
  }: {
    withPayout?: boolean;
    withPayoutAccount?: boolean;
    paymentState?: "authorized" | "captured";
    withPhysicalShipment?: boolean;
    withPhysicalFulfillment?: boolean;
    livemode?: boolean;
  } = {},
) {
  assert.equal(process.env.NODE_ENV, "test");
  assert.ok(paymentState === "authorized" || paymentState === "captured");
  const withPhysicalInventory = withPhysicalShipment || withPhysicalFulfillment;
  assert.ok(!withPhysicalInventory || paymentState === "captured");
  assert.ok(
    !withPayout || paymentState === "captured",
    "A payout requires capture",
  );
  const id = randomUUID();
  const commission = container.resolve<CommissionModuleService>(
    MercurModules.COMMISSION,
  );
  const rates = await commission.listCommissionRates(
    {},
    { take: 2, relations: ["rules"] },
  );
  assert.ok(
    rates.length <= 1,
    "The fixture requires a clean commission catalog",
  );
  if (rates.length) {
    assert.ok(rates[0].is_default && !rates[0].rules.length);
    await updateCommissionRatesWorkflow(container).run({
      input: [
        {
          id: rates[0].id,
          type: CommissionRateType.PERCENTAGE,
          value: 8,
          is_enabled: true,
          include_shipping: false,
          include_tax: false,
        },
      ],
    });
  } else {
    await createCommissionRatesWorkflow(container).run({
      input: [
        {
          name: "Finance durability default",
          code: `durability-${id}`,
          type: CommissionRateType.PERCENTAGE,
          value: 8,
          is_default: true,
          is_enabled: true,
          include_shipping: false,
          include_tax: false,
        },
      ],
    });
  }

  const rbac = container.resolve<IRbacModuleService>(Modules.RBAC);
  const policyIds: string[] = [];
  for (const [resource, operation] of [
    ["order", PolicyOperation.read],
    ["order", PolicyOperation.update],
    ["payment", PolicyOperation.read],
    ["payment", PolicyOperation.update],
    ["capture", PolicyOperation.create],
    ["refund", PolicyOperation.create],
    ["payment_collection", PolicyOperation.read],
    ["payment_collection", PolicyOperation.update],
    ["return", PolicyOperation.read],
    ["return", PolicyOperation.create],
    ["return", PolicyOperation.update],
    ["return", PolicyOperation.delete],
    ["order_change", PolicyOperation.read],
    ["order_change", PolicyOperation.create],
    ["order_change", PolicyOperation.update],
  ] as const) {
    const existing = await rbac.listRbacPolicies({ resource, operation });
    if (existing.length) policyIds.push(...existing.map((policy) => policy.id));
    else {
      const { result } = await createRbacPoliciesWorkflow(container).run({
        input: {
          policies: [{ key: `${resource}:${operation}`, resource, operation }],
        },
      });
      policyIds.push(...result.map((policy) => policy.id));
    }
  }
  const { result: roles } = await createRbacRolesWorkflow(container).run({
    input: {
      roles: [{ name: `finance-durability-${id}`, policy_ids: policyIds }],
    },
  });
  const { result: users } = await createUsersWorkflow(container).run({
    input: {
      users: [
        {
          email: `finance-durability-${id}@example.invalid`,
          roles: [roles[0].id],
        },
      ],
    },
  });
  const actorId = users[0].id;
  await requireFinanceOperator(container, actorId);
  const sellers = container.resolve<InstanceType<typeof SellerModule.service>>(
    MercurModules.SELLER,
  );
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const orders = container.resolve<IOrderModuleService>(Modules.ORDER);
  const offers = container.resolve<InstanceType<typeof OfferModule.service>>(
    MercurModules.OFFER,
  );
  const profile = await container
    .resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)
    .createShippingProfiles({
      name: `Finance durability ${id}`,
      type: "default",
    });

  async function createShipping(
    sellerId: string,
    productId: string,
    label: string,
  ) {
    const { result: locations } = await createStockLocationsWorkflow(
      container,
    ).run({
      input: {
        locations: [
          {
            name: `Finance durability ${label} ${id}`,
            address: {
              address_1: "Disposable fixture warehouse",
              country_code: "us",
            },
          },
        ],
      },
    });
    const location = locations[0];
    if (withPhysicalInventory) {
      await onboardingService(container).createVendorWarehouses({
        seller_id: sellerId,
        stock_location_id: location.id,
        application_id: `durability-fixture-${id}`,
        operation_id: randomUUID(),
        submission_revision: 1,
        address: { finance_data_kind: livemode ? "ordinary" : "qa_fixture" },
        name: location.name,
        created_location: true,
        state: "ready",
      });
    }
    const fulfillment = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT,
    );
    const set = await fulfillment.createFulfillmentSets({
      name: `Finance durability ${label} ${id}`,
      type: "shipping",
    });
    const zone = await fulfillment.createServiceZones({
      name: `Finance durability ${label} ${id}`,
      fulfillment_set_id: set.id,
      geo_zones: [{ type: "country", country_code: "us" }],
    });
    await createLinksWorkflow(container).run({
      input: [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
          [MercurModules.SELLER]: { seller_id: sellerId },
        },
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
          [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
        },
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
        },
        {
          [MercurModules.SELLER]: { seller_id: sellerId },
          [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
        },
        {
          [Modules.PRODUCT]: { product_id: productId },
          [Modules.FULFILLMENT]: { shipping_profile_id: profile.id },
        },
      ],
    });
    const { result: shippingOptions } = await createShippingOptionsWorkflow(
      container,
    ).run({
      input: [
        {
          name: `Finance durability ${label}`,
          service_zone_id: zone.id,
          shipping_profile_id: profile.id,
          provider_id: "manual_manual",
          price_type: "flat",
          prices: [{ currency_code: "usd", amount: 0 }],
          type: {
            label: "Manual fixture",
            description: "Disposable fixture delivery",
            code: `durability-${label}-${id}`,
          },
          data: { id: "manual-fulfillment" },
        },
      ],
    });
    const option = shippingOptions[0];
    await createLinksWorkflow(container).run({
      input: [
        {
          [Modules.FULFILLMENT]: { shipping_option_id: option.id },
          [MercurModules.SELLER]: { seller_id: sellerId },
        },
      ],
    });
    return { locationId: location.id, option };
  }

  async function createSale(amount: number, label: "target" | "sibling") {
    const quantity = withPhysicalInventory && label === "target" ? 3 : 1;
    const seller = await sellers.createSellers({
      name: `Finance durability ${label}`,
      handle: `durability-${label}-${id}`,
      email: `durability-${label}-${id}@example.invalid`,
      currency_code: "usd",
    });
    const product = await products.createProducts({
      title: `Finance durability ${label}`,
      handle: `durability-${label}-${id}`,
      options: [{ title: "Size", values: ["One"] }],
      variants: [
        { title: "One", options: { Size: "One" }, manage_inventory: false },
      ],
    });
    const variant = product.variants![0];
    const offer = await offers.createOffers({
      seller_id: seller.id,
      product_id: product.id,
      variant_id: variant.id,
      shipping_profile_id: profile.id,
      sku: `durability-${label}-${id}`,
      created_by: actorId,
      manage_inventory: withPhysicalInventory,
    });
    const item = {
      title: product.title,
      product_id: product.id,
      variant_id: variant.id,
      unit_price: amount / quantity,
      quantity,
      ...(paymentState === "authorized" || withPhysicalInventory
        ? { requires_shipping: true }
        : {}),
    };
    const shipping =
      paymentState === "authorized" || withPhysicalInventory
        ? await createShipping(seller.id, product.id, label)
        : undefined;
    const order = await orders.createOrders({
      currency_code: "usd",
      items: [item],
      ...(shipping
        ? {
            shipping_methods: [
              {
                name: shipping.option.name,
                shipping_option_id: shipping.option.id,
                amount: 0,
                data: {},
              },
            ],
            shipping_address: {
              first_name: "Finance",
              last_name: "Durability",
              address_1: "Disposable fixture delivery",
              city: "New York",
              province: "NY",
              postal_code: "10001",
              country_code: "us",
            },
          }
        : {}),
    });
    let inventoryItemId: string | undefined;
    if (withPhysicalInventory) {
      assert.ok(shipping);
      const inventory = container.resolve<IInventoryService>(Modules.INVENTORY);
      const inventoryItem = await inventory.createInventoryItems({
        sku: `durability-stock-${label}-${id}`,
        title: product.title,
      });
      inventoryItemId = inventoryItem.id;
      await inventory.createInventoryLevels({
        inventory_item_id: inventoryItem.id,
        location_id: shipping.locationId,
        stocked_quantity: 10,
      });
      await createLinksWorkflow(container).run({
        input: [
          {
            [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
            [MercurModules.SELLER]: { seller_id: seller.id },
          },
        ],
      });
      await batchOfferInventoryItemsWorkflow(container).run({
        input: {
          offer_id: offer.id,
          create: [
            { inventory_item_id: inventoryItem.id, required_quantity: 1 },
          ],
        },
      });
      await inventory.createReservationItems({
        inventory_item_id: inventoryItem.id,
        location_id: shipping.locationId,
        line_item_id: order.items![0].id,
        quantity,
      });
    }
    return { seller, offer, order, item, amount, shipping, inventoryItemId };
  }
  // Three whole-price items exercise cumulative returns without fractional USD.
  const target = await createSale(withPhysicalInventory ? 69 : 70, "target");
  const sibling = await createSale(withPhysicalInventory ? 31 : 30, "sibling");
  const sales = [target, sibling];
  const cart = await container
    .resolve<ICartModuleService>(Modules.CART)
    .createCarts({
      currency_code: "usd",
      items: sales.map((sale) => sale.item),
    });
  const payments = container.resolve<IPaymentModuleService>(Modules.PAYMENT);
  const collection = await payments.createPaymentCollections({
    currency_code: "usd",
    amount: 100,
  });
  const session = await payments.createPaymentSession(collection.id, {
    provider_id: "pp_stripe_stripe",
    currency_code: "usd",
    amount: 100,
    data: {},
  });
  assert.equal(session.data.id, "pi_durability");
  assert.equal(session.data.livemode, livemode);
  assert.equal(session.data.status, "requires_capture");
  const group = await sellers.createOrderGroups({ cart_id: cart.id });
  await createLinksWorkflow(container).run({
    input: [
      {
        [Modules.CART]: { cart_id: cart.id },
        [Modules.PAYMENT]: { payment_collection_id: collection.id },
      },
      ...sales.flatMap(({ order, seller, offer }): LinkDefinition[] => [
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
      ]),
    ],
  });

  // Same ordering as Mercur's beforePaymentAuthorization hook. No fabricated
  // snapshot, finance allocation or journal operation is inserted by the fixture.
  await freezeOriginalSaleWorkflow(container).run({
    input: { cart_id: cart.id },
  });
  const { result: payment } = await authorizeFixturePaymentWorkflow(
    container,
  ).run({
    input: { id: session.id },
  });
  assert.ok(payment);
  assert.equal(payment.captures?.length ?? 0, 0);
  if (paymentState === "captured") {
    const { result: captured } = await recordFinalCaptureWorkflow(
      container,
    ).run({
      input: { payment_id: payment.id, amount: 100, captured_by: actorId },
    });
    assert.equal(captured.captures?.length, 1);
    const capture = captured.captures![0];
    assert.ok(MathBN.eq(capture.amount, 100));
    assert.equal(captured.data?.id, "pi_durability");
    assert.equal(captured.data?.status, "succeeded");
    assert.equal(captured.data?.latest_charge, "ch_durability");
    for (const { order, amount } of sales) {
      await recordAllocatedRefundWorkflow(container).run({
        input: {
          order_id: order.id,
          amount,
          currency_code: "usd",
          reference: "capture",
          reference_id: capture.id,
        },
      });
    }
  }
  if (paymentState === "authorized" || withPhysicalInventory) {
    for (const { order, shipping, item: saleItem } of sales) {
      assert.ok(shipping);
      const { result: fulfillment } = await createOrderFulfillmentWorkflow(
        container,
      ).run({
        input: {
          order_id: order.id,
          location_id: shipping.locationId,
          shipping_option_id: shipping.option.id,
          items: order.items!.map((item) => ({
            id: item.id,
            quantity: saleItem.quantity,
          })),
          created_by: actorId,
          no_notification: true,
        },
      });
      if (withPhysicalShipment) {
        await createOrderShipmentWorkflow(container).run({
          input: {
            order_id: order.id,
            fulfillment_id: fulfillment.id,
            items: order.items!.map((item) => ({
              id: item.id,
              quantity: saleItem.quantity,
            })),
            no_notification: true,
          },
        });
      }
    }
  }

  let transferId: string | undefined;
  let payoutAccountId: string | undefined;
  if (withPayout || withPayoutAccount) {
    const account = await container
      .resolve<InstanceType<typeof PayoutModule.service>>(MercurModules.PAYOUT)
      .createPayoutAccounts({
        status: PayoutAccountStatus.ACTIVE,
        data: { id: "acct_durabilityseller" },
      });
    payoutAccountId = account.id;
    await createLinksWorkflow(container).run({
      input: [
        {
          [MercurModules.SELLER]: { seller_id: target.seller.id },
          [MercurModules.PAYOUT]: { payout_account_id: account.id },
        },
      ],
    });
    if (withPayout) {
      transferId = "tr_durability";
      const { result: payout } = await recordReconciledPayoutWorkflow(
        container,
      ).run({
        input: {
          id: `pout_durability_${id.replaceAll("-", "")}`,
          account_id: account.id,
          amount: 64.4,
          currency_code: "usd",
          status: PayoutStatus.PAID,
          data: {
            id: transferId,
            destination: "acct_durabilityseller",
            source_transaction: "ch_durability",
            transfer_group: "group_pi_durability",
            livemode,
            metadata: {
              seller_id: target.seller.id,
              order_id: target.order.id,
            },
          },
        },
      });
      await linkSettlementPayoutWorkflow(container).run({
        input: { payout_id: payout.id, seller_id: target.seller.id },
      });
    }
  }

  for (const { order, amount } of sales) {
    const current = await readOrderFinance(container, order.id, {
      actor_id: actorId,
    });
    assert.equal(current.financialProblem, null);
    assert.equal(current.originals.length, 2);
    if (withPhysicalInventory) {
      const {
        data: [nativeOrder],
      } = await container.resolve(ContainerRegistrationKeys.QUERY).graph(
        {
          entity: "order",
          fields: ["items.*", "items.detail.*"],
          filters: { id: order.id },
        },
        { cache: { enable: false } },
      );
      const shipped = nativeOrder.items![0]!;
      assert.equal(
        Number(shipped.detail?.shipped_quantity),
        withPhysicalShipment ? (order.id === target.order.id ? 3 : 1) : 0,
        `Native shipped fixture quantities: ${JSON.stringify(nativeOrder.items?.map((item) => item && { id: item.id, quantity: item.quantity, detail: item.detail }))}`,
      );
    }
    assert.equal(current.original?.gross, amount);
    assert.equal(
      current.original.commission,
      MathBN.mult(amount, 0.08).toNumber(),
    );
    assert.equal(
      current.original.seller_entitlement,
      MathBN.mult(amount, 0.92).toNumber(),
    );
    if (paymentState === "captured") {
      assert.equal(current.view.finance.captured_total, amount);
      assert.equal(current.view.finance.refund.allowed, true);
    } else {
      assert.equal(current.view.finance.captured_total, 0);
      assert.equal(current.view.finance.refund.allowed, false);
      assert.equal(current.view.finance.capture.allowed, true);
      assert.equal(current.view.finance.capture.amount, 100);
    }
  }
  return {
    groupId: group.id,
    cartId: cart.id,
    orderId: target.order.id,
    siblingOrderId: sibling.order.id,
    sellerId: target.seller.id,
    siblingSellerId: sibling.seller.id,
    actorId,
    paymentId: payment.id,
    paymentIntentId: "pi_durability",
    chargeId: "ch_durability",
    transferId,
    payoutAccountId,
    itemId: target.order.items![0].id,
    siblingItemId: sibling.order.items![0].id,
    locationId: target.shipping?.locationId,
    siblingLocationId: sibling.shipping?.locationId,
    inventoryItemId: target.inventoryItemId,
  };
}
