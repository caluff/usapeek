import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { FulfillmentWorkflow, IAuthModuleService, LinkDefinition, MedusaContainer, ShippingOptionDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PolicyOperation, ProductStatus } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createCustomerAccountWorkflow,
  createProductsWorkflow,
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createRegionsWorkflow,
  createRemoteLinkStep,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createUsersWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  setAuthAppMetadataWorkflow,
  updateInventoryItemsWorkflow,
  updateShippingOptionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/core-flows";
import {
  approveSellerWorkflow,
  batchCommissionRulesWorkflow,
  createCommissionRatesWorkflow,
  createOffersWorkflow,
  createSellerAccountWorkflow,
  updateCommissionRatesWorkflow,
} from "@mercurjs/core/workflows";
import { CommissionRateType, MercurModules } from "@mercurjs/types";
import type { CommissionRateDTO } from "@mercurjs/types";
import { onboardingService } from "../../src/lib/vendor-onboarding/access";
import { configureVendorShippingWorkflow } from "../../src/workflows/configure-vendor-shipping";

export type NativeCheckoutFixtureInput = {
  runId: string;
  scenario: string;
  inventoryQuantity: number;
  productCount?: number;
};

type WarehouseInput = {
  sellerId: string;
  locationId: string;
  profileId: string;
  channelId: string;
  runId: string;
  scenario: string;
};

const claimFixtureWarehouseStep = createStep(
  "native-checkout-fixture-claim-warehouse",
  async (input: WarehouseInput, { container }) => {
    // This test-only claim bypasses application review; it does not prove onboarding.
    const claim = await onboardingService(container).createVendorWarehouses({
      seller_id: input.sellerId,
      stock_location_id: input.locationId,
      application_id: `qa-fixture-${randomUUID()}`,
      operation_id: randomUUID(),
      submission_revision: 1,
      address: { finance_data_kind: "qa_fixture", run_id: input.runId, scenario: input.scenario },
      name: `QA warehouse ${input.runId}`,
      created_location: true,
      state: "ready",
    });
    return new StepResponse(claim.id, claim.id);
  },
  async (id, { container }) => {
    if (id) await onboardingService(container).deleteVendorWarehouses(id);
  },
);

const prepareFixtureWarehouseWorkflow = createWorkflow(
  "native-checkout-fixture-prepare-warehouse",
  function (input: WarehouseInput) {
    createRemoteLinkStep(transform(input, (value): LinkDefinition[] => [
      { [Modules.STOCK_LOCATION]: { stock_location_id: value.locationId }, [MercurModules.SELLER]: { seller_id: value.sellerId } },
      { [Modules.FULFILLMENT]: { shipping_profile_id: value.profileId }, [MercurModules.SELLER]: { seller_id: value.sellerId } },
      { [Modules.SALES_CHANNEL]: { sales_channel_id: value.channelId }, [Modules.STOCK_LOCATION]: { stock_location_id: value.locationId } },
    ]));
    return new WorkflowResponse(claimFixtureWarehouseStep(input));
  },
);

function assertDisposableDatabase(container: MedusaContainer) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const database = new URL(config.projectConfig.databaseUrl ?? "invalid:");
  if (process.env.NODE_ENV !== "test" || database.hostname !== "localhost" ||
    !/^\/closure_[a-z0-9_]+$/.test(database.pathname) || process.env.DB_PORT !== "55432" ||
    database.port !== "55432" || process.env.DB_USERNAME !== "closure_test" ||
    decodeURIComponent(database.username) !== "closure_test" || process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS || !existsSync(process.env.NODE_EXTRA_CA_CERTS) ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA || process.env.AUTH_EMAIL_ENABLED !== "false") {
    throw new Error("Native checkout fixtures require a guarded local closure database with TLS and email disabled.");
  }
}

async function verifiedIdentity(container: MedusaContainer) {
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const email = `qa-checkout-${randomUUID()}@example.invalid`;
  const password = `Disposable-${randomUUID()}!`;
  const registration = await auth.register("emailpass", { body: { email, password } });
  if (!registration.success || !registration.authIdentity) throw new Error("Native fixture registration failed.");
  const authIdentityId = registration.authIdentity.id;
  const verification = await auth.requestAuthVerification({
    auth_identity_id: authIdentityId, entity_id: email, entity_type: "email", code_provider: "token",
  });
  if (!verification.code) throw new Error("Native fixture verification code is missing.");
  await auth.confirmAuthVerification({ code: verification.code, auth_identity_id: authIdentityId });
  return { auth_identity_id: authIdentityId, credentials: { email, password } };
}

/**
 * Creates inputs for a real checkout in a runner-owned database. It creates no
 * carts, orders, payment sessions or provider accounts. Keep credentials in
 * memory or the explicitly authorized private external file; never log or save
 * the complete manifest with credentials alongside public fixture evidence.
 * Call once per restored database: the fixture owns the US region assignment.
 */
export async function prepareNativeCheckoutFixture(container: MedusaContainer, input: NativeCheckoutFixtureInput) {
  assertDisposableDatabase(container);
  const productCount = input.productCount ?? 2;
  if (!input.runId.trim() || !input.scenario.trim() ||
    !Number.isSafeInteger(input.inventoryQuantity) || input.inventoryQuantity < 0 ||
    !Number.isInteger(productCount) || productCount < 1 || productCount > 31) {
    throw new Error("Provide a run/scenario, non-negative inventory and 1–31 products.");
  }
  const metadata = { finance_data_kind: "qa_fixture", run_id: input.runId, scenario: input.scenario };
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_sales_channel_id", "supported_currencies.currency_code"] });
  if (stores.length !== 1) throw new Error("The disposable fixture requires exactly one native bootstrap store.");
  const { result: channels } = await createSalesChannelsWorkflow(container).run({ input: {
    salesChannelsData: [{ name: `QA checkout ${input.runId}` }],
  } });
  const channelId = channels[0].id;
  // Native vendor shipping reads the bootstrap default. Never replace an existing default.
  await updateStoresWorkflow(container).run({ input: {
    selector: { id: stores[0].id },
    update: {
      default_sales_channel_id: stores[0].default_sales_channel_id ?? channelId,
      supported_currencies: [
        ...stores[0].supported_currencies.flatMap(currency => {
          const code = currency?.currency_code;
          return typeof code === "string" && code !== "usd"
            ? [{ currency_code: code, is_default: false }]
            : [];
        }),
        { currency_code: "usd", is_default: true },
      ],
    },
  } });
  const { result: regions } = await createRegionsWorkflow(container).run({ input: {
    regions: [{ name: `QA USD ${input.runId}`, currency_code: "usd", countries: ["us"], automatic_taxes: false, metadata }],
  } });
  const { result: keys } = await createApiKeysWorkflow(container).run({ input: {
    api_keys: [{ title: `QA checkout ${input.runId}`, type: "publishable", created_by: "integration-test" }],
  } });
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: keys[0].id, add: [channelId] } });

  const buyer = await verifiedIdentity(container);
  const { result: customer } = await createCustomerAccountWorkflow(container).run({ input: {
    authIdentityId: buyer.auth_identity_id,
    customerData: { email: buyer.credentials.email, first_name: "QA", last_name: "Checkout", metadata },
  } });
  const secondBuyer = await verifiedIdentity(container);
  const { result: secondCustomer } = await createCustomerAccountWorkflow(container).run({ input: {
    authIdentityId: secondBuyer.auth_identity_id,
    customerData: { email: secondBuyer.credentials.email, first_name: "QA", last_name: "Other shopper", metadata },
  } });
  const operator = await verifiedIdentity(container);
  const rbac = container.resolve(Modules.RBAC);
  const policyIds: string[] = [];
  for (const resource of ["order", "order_change", "payment", "payment_collection", "refund", "commission_rate", "seller", "payout", "fulfillment"]) {
    for (const operation of [PolicyOperation.read, PolicyOperation.create, PolicyOperation.update, PolicyOperation.delete]) {
      const existing = await rbac.listRbacPolicies({ resource, operation });
      if (existing.length) policyIds.push(...existing.map(policy => policy.id));
      else {
        const policy = { key: `${resource}:${operation}`, resource, operation };
        const { result } = await createRbacPoliciesWorkflow(container).run({ input: { policies: [policy] } });
        policyIds.push(...result.map(policy => policy.id));
      }
    }
  }
  const { result: roles } = await createRbacRolesWorkflow(container).run({ input: {
    roles: [{ name: `qa-checkout-${randomUUID()}`, policy_ids: policyIds }],
  } });
  const { result: users } = await createUsersWorkflow(container).run({ input: {
    users: [{ email: operator.credentials.email, first_name: "QA", last_name: "Operator", roles: [roles[0].id], metadata }],
  } });
  await setAuthAppMetadataWorkflow(container).run({ input: { authIdentityId: operator.auth_identity_id, actorType: "user", value: users[0].id } });

  const vendors = [] as {
    seller_id: string; member_id: string; auth_identity_id: string;
    credentials: { email: string; password: string }; location_id: string;
    shipping_profile_id: string; shipping_option_id: string;
  }[];
  for (let index = 0; index < 2; index++) {
    const account = await verifiedIdentity(container);
    const { result: seller } = await createSellerAccountWorkflow(container).run({ input: {
      auth_identity_id: account.auth_identity_id, member_email: account.credentials.email,
      seller: { name: `QA seller ${index + 1}`, handle: `qa-checkout-${randomUUID()}`, email: account.credentials.email, currency_code: "usd", metadata },
    } });
    await approveSellerWorkflow(container).run({ input: { seller_id: seller.id } });
    const identity = await container.resolve<IAuthModuleService>(Modules.AUTH).retrieveAuthIdentity(account.auth_identity_id);
    const memberId = identity.app_metadata?.member_id;
    if (typeof memberId !== "string") throw new Error("Native seller fixture has no bound member.");
    const { result: locations } = await createStockLocationsWorkflow(container).run({ input: {
      locations: [{ name: `QA warehouse ${input.runId} ${index + 1}`, address: { address_1: "1 Test Street", city: "Seattle", province: "wa", postal_code: "98101", country_code: "us", metadata }, metadata }],
    } });
    const { result: profiles } = await createShippingProfilesWorkflow(container).run({ input: {
      data: [{ name: `QA delivery ${randomUUID()}`, type: "default" }],
    } });
    await prepareFixtureWarehouseWorkflow(container).run({ input: {
      sellerId: seller.id, locationId: locations[0].id, profileId: profiles[0].id,
      channelId, runId: input.runId, scenario: input.scenario,
    } });
    await configureVendorShippingWorkflow(container).run({ input: {
      seller_id: seller.id,
      configuration: { action: "create_option", shipping_profile_id: profiles[0].id, name: "QA manual delivery", description: "Disposable local fixture", amount: 5 },
    } });
    const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id", "metadata"], filters: { shipping_profile_id: profiles[0].id } });
    if (options.length !== 1) throw new Error("Native fixture shipping option was not created uniquely.");
    // The installed model/DTO has metadata; the 2.18 workflow input omits it.
    const taggedOptions: (FulfillmentWorkflow.UpdateShippingOptionsWorkflowInput & Pick<ShippingOptionDTO, "metadata">)[] = [
      { id: options[0].id, metadata: { ...options[0].metadata, ...metadata } },
    ];
    await updateShippingOptionsWorkflow(container).run({ input: taggedOptions });
    vendors.push({ ...account, seller_id: seller.id, member_id: memberId, location_id: locations[0].id, shipping_profile_id: profiles[0].id, shipping_option_id: options[0].id });
  }

  const products = [] as {
    id: string; handle: string; variant_id: string; seller_id: string; offer_id: string;
    inventory_item_id: string; location_id: string; sku: string; shipping_profile_id: string;
  }[];
  for (let index = 0; index < productCount; index++) {
    const vendor = vendors[index % vendors.length];
    const sku = `qa-checkout-${randomUUID()}`;
    const { result: created } = await createProductsWorkflow(container).run({ input: { products: [{
      title: `QA checkout product ${index + 1}`, handle: sku, status: ProductStatus.PUBLISHED,
      shipping_profile_id: vendor.shipping_profile_id, sales_channels: [{ id: channelId }], metadata,
      options: [{ title: "Size", values: ["One"] }],
      variants: [{ title: "One", options: { Size: "One" }, manage_inventory: false, metadata }],
    }] } });
    const product = created[0];
    const variantId = product.variants![0].id;
    // Mercur 2.3.3 links inventory using the batch's first seller; do not mix sellers.
    const { result: offers } = await createOffersWorkflow(container).run({ input: { offers: [{
      seller_id: vendor.seller_id, created_by: vendor.member_id, variant_id: variantId,
      shipping_profile_id: vendor.shipping_profile_id, sku, manage_inventory: true, allow_backorder: false, metadata,
      prices: [{ currency_code: "usd", amount: 19.99 }],
      inventory_items: [{ sku, stock_levels: [{ location_id: vendor.location_id, stocked_quantity: input.inventoryQuantity }] }],
    }] } });
    const { data: linked } = await query.graph({ entity: "offer", fields: ["id", "inventory_items.id"], filters: { id: offers[0].id } }, { cache: { enable: false } });
    const inventoryId = linked[0]?.inventory_items?.[0]?.id;
    if (!inventoryId || linked[0].inventory_items?.length !== 1) throw new Error("Native offer inventory is missing or ambiguous.");
    await updateInventoryItemsWorkflow(container).run({ input: { updates: [{ id: inventoryId, metadata }] } });
    products.push({ id: product.id, handle: product.handle!, variant_id: variantId, seller_id: vendor.seller_id, offer_id: offers[0].id, inventory_item_id: inventoryId, location_id: vendor.location_id, sku, shipping_profile_id: vendor.shipping_profile_id });
  }
  const { result: commissionResult } = await createCommissionRatesWorkflow(container).run({ input: [{
    name: `QA checkout ${input.runId}`, code: `qa-checkout-${randomUUID()}`, type: CommissionRateType.PERCENTAGE,
    value: 10, currency_code: "usd", is_enabled: false, is_default: false, include_tax: false, include_shipping: false,
  }] });
  const rates = commissionResult as CommissionRateDTO[];
  await batchCommissionRulesWorkflow(container).run({ input: {
    commission_rate_id: rates[0].id,
    create: products.map(product => ({ reference: "product", reference_id: product.id })),
  } });
  await updateCommissionRatesWorkflow(container).run({ input: [{ id: rates[0].id, is_enabled: true }] });
  return {
    run_id: input.runId, scenario: input.scenario, local_only: true as const,
    region_id: regions[0].id, currency_code: "usd" as const, sales_channel_id: channelId,
    publishable_key: keys[0].token, publishable_key_id: keys[0].id,
    customer: { ...buyer, customer_id: customer.id },
    customers: [{ ...buyer, customer_id: customer.id }, { ...secondBuyer, customer_id: secondCustomer.id }],
    admin: { ...operator, user_id: users[0].id, role_id: roles[0].id },
    vendors, products, shipping_option_ids: vendors.map(vendor => vendor.shipping_option_id),
    commission_rate_id: rates[0].id,
  };
}

export type NativeCheckoutFixture = Awaited<ReturnType<typeof prepareNativeCheckoutFixture>>;
