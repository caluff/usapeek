/**
 * Opt in with CATALOG_PERMISSION_TESTS=disposable-local after importing the
 * isolated integration environment. The native runner owns and drops its UUID
 * localhost database/template and uses a dedicated TLS Redis DB15. Real HTTP,
 * auth, RBAC, Mercur moderation/actions and PostgreSQL remain enabled; outbound
 * providers and automatic financial jobs remain disabled. Catalog image rows
 * below are ownership fixtures, not uploads to any external storage service.
 */
import { randomUUID } from "node:crypto";
import { Client } from "@medusajs/framework/pg";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PolicyOperation } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createApiKeysWorkflow, createLinksWorkflow, createRbacPoliciesWorkflow, createRbacRolesWorkflow, createSalesChannelsWorkflow, createStockLocationsWorkflow, createUsersWorkflow, linkSalesChannelsToApiKeyWorkflow, updateProductsWorkflow, updateStoresWorkflow } from "@medusajs/core-flows";
import { approveSellerWorkflow, createProductsWorkflow, createSellerAccountWorkflow, createSellerDefaultRolesStep, createSellerShippingProfilesWorkflow } from "@mercurjs/core/workflows";
import { AttributeType, MercurModules, ProductStatus } from "@mercurjs/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import type OfferModule from "@mercurjs/core/modules/offer";
import type ProductEditModule from "@mercurjs/core/modules/product-edit";
import type RbacModule from "@medusajs/medusa/rbac";
import { CATALOG_MEDIA_MODULE } from "../../src/modules/catalog-media";
import type CatalogMediaService from "../../src/modules/catalog-media/service";
import { VENDOR_ONBOARDING_MODULE } from "../../src/modules/vendor-onboarding";
import type VendorOnboardingService from "../../src/modules/vendor-onboarding/service";
import { assertOffersNotPaused } from "../../src/lib/catalog/sale-pause";

const restoreCatalogVendorRolesWorkflow = createWorkflow(
  "catalog-permission-test-restore-vendor-roles",
  function () {
    return new WorkflowResponse(createSellerDefaultRolesStep());
  },
);

const createCatalogPermissionImageFixtureStep = createStep(
  "catalog-permission-test-image-fixture",
  async (input: { sellerId: string; memberId: string }, { container }) => {
    const image = await container.resolve<CatalogMediaService>(CATALOG_MEDIA_MODULE).createCatalogImages({
      seller_id: input.sellerId,
      member_id: input.memberId,
      file_id: `disposable-${randomUUID()}`,
      url: `http://localhost:1/disposable-catalog-${randomUUID()}.jpg`,
    });
    return new StepResponse(image, image.id);
  },
  async (id, { container }) => {
    if (id) await container.resolve<CatalogMediaService>(CATALOG_MEDIA_MODULE).deleteCatalogImages(id);
  },
);
const createCatalogPermissionImageFixtureWorkflow = createWorkflow(
  "catalog-permission-test-image-fixture",
  function (input: { sellerId: string; memberId: string }) {
    return new WorkflowResponse(createCatalogPermissionImageFixtureStep(input));
  },
);
const claimCatalogWarehouseFixtureStep = createStep(
  "claim-catalog-warehouse-fixture",
  async (input: { seller_id: string; stock_location_id: string }, { container }) => {
    const claim = await container.resolve<VendorOnboardingService>(VENDOR_ONBOARDING_MODULE).createVendorWarehouses({
      ...input, application_id: `disposable-${randomUUID()}`, operation_id: `disposable-${randomUUID()}`,
      submission_revision: 1, address: {}, name: "Disposable catalog warehouse", created_location: true, state: "ready",
    });
    return new StepResponse(claim.id, claim.id);
  },
  async (id, { container }) => {
    if (id) await container.resolve<VendorOnboardingService>(VENDOR_ONBOARDING_MODULE).deleteVendorWarehouses(id);
  },
);
const claimCatalogWarehouseFixtureWorkflow = createWorkflow("claim-catalog-warehouse-fixture", function (input: { seller_id: string; stock_location_id: string }) {
  return new WorkflowResponse(claimCatalogWarehouseFixtureStep(input));
});

const enabled = process.env.CATALOG_PERMISSION_TESTS === "disposable-local";
if (!enabled) {
  describe.skip("Catalog permissions integration (requires disposable-local opt-in)", () => {
    it("requires disposable PostgreSQL and dedicated TLS Redis; see file header", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
      process.env.DB_PORT !== "55432" || process.env.DB_USERNAME !== "closure_test" ||
      !process.env.DB_PASSWORD || process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error("Catalog permission coverage requires explicit disposable localhost PostgreSQL credentials.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || redis.port !== "56379" ||
      redis.username !== "closure" || !redis.password || redis.pathname !== "/15") {
    throw new Error("Catalog permission coverage requires dedicated localhost TLS Redis DB15.");
  }
  const dbName = `closure_catalog_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async container => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        const database = new URL(config.projectConfig.databaseUrl!);
        if (database.hostname !== "localhost" || database.port !== "55432" ||
            database.pathname !== `/${dbName}` || config.projectConfig.redisUrl !== process.env.REDIS_URL) {
          throw new Error("Refusing catalog permission coverage against any other database or Redis.");
        }
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) =>
            typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Disposable catalog coverage allows only local/mock notifications.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      type Actor = { token: string; sellerId?: string; memberId?: string; userId?: string };
      type Vendor = Actor & { sellerId: string; memberId: string };
      type NativeSellerService = InstanceType<typeof SellerModule.service>;
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const nativeSellers = () => getContainer().resolve<NativeSellerService>(MercurModules.SELLER);
      const request = (method: "GET" | "POST" | "DELETE", url: string, actor?: Actor, data?: object) => api.request({
        method, url, data,
        headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}), ...(actor?.sellerId ? { "x-seller-id": actor.sellerId } : {}) },
        validateStatus: () => true,
      });
      async function identity() {
        const email = `catalog-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registered = await auth().register("emailpass", { body: { email, password } });
        if (!registered.success || !registered.authIdentity) throw new Error("Native disposable identity registration failed.");
        const id = registered.authIdentity.id;
        const verification = await auth().requestAuthVerification({ auth_identity_id: id, entity_id: email, entity_type: "email", code_provider: "token" });
        if (!verification.code) throw new Error("Native disposable identity verification returned no code.");
        await auth().confirmAuthVerification({ code: verification.code, auth_identity_id: id });
        return { id, email, password };
      }
      async function login(actor: "user" | "member", account: Awaited<ReturnType<typeof identity>>) {
        const response = await request("POST", `/auth/${actor}/emailpass`, undefined, { email: account.email, password: account.password });
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token as string;
      }
      async function operator(readOnly = false): Promise<Actor & { userId: string }> {
        const account = await identity();
        const operations = readOnly ? [PolicyOperation.read] : [PolicyOperation.read, PolicyOperation.create, PolicyOperation.update, PolicyOperation.delete];
        const rbac = getContainer().resolve(Modules.RBAC);
        const policyIds: string[] = [];
        for (const resource of ["seller", "product", "product_change"]) {
          for (const operation of operations) {
            const existing = await rbac.listRbacPolicies({ resource, operation });
            if (existing.length) policyIds.push(...existing.map(policy => policy.id));
            else {
              const { result } = await createRbacPoliciesWorkflow(getContainer()).run({ input: { policies: [{ key: `${resource}:${operation}`, resource, operation }] } });
              policyIds.push(...result.map(policy => policy.id));
            }
          }
        }
        const { result: roles } = await createRbacRolesWorkflow(getContainer()).run({ input: { roles: [{ name: `catalog-${randomUUID()}`, policy_ids: policyIds }] } });
        const { result: users } = await createUsersWorkflow(getContainer()).run({ input: { users: [{ email: account.email, roles: [roles[0].id] }] } });
        await auth().updateAuthIdentities({ id: account.id, app_metadata: { user_id: users[0].id } });
        return { userId: users[0].id, token: await login("user", account) };
      }
      async function vendor(): Promise<Vendor> {
        const account = await identity();
        const { result: seller } = await createSellerAccountWorkflow(getContainer()).run({ input: {
          auth_identity_id: account.id, member_email: account.email,
          seller: { name: `Disposable catalog ${randomUUID()}`, handle: `catalog-${randomUUID()}`, email: account.email, currency_code: "usd" },
        } });
        await approveSellerWorkflow(getContainer()).run({ input: { seller_id: seller.id } });
        const memberId = (await auth().retrieveAuthIdentity(account.id)).app_metadata?.member_id;
        if (typeof memberId !== "string") throw new Error("Native seller member binding is missing.");
        return { sellerId: seller.id, memberId, token: await login("member", account) };
      }
      async function permission(admin: Actor, owner: Vendor, mode: "supervised" | "authorized") {
        const response = await request("POST", `/admin/sellers/${owner.sellerId}/catalog-permission`, admin, { mode });
        expect(response.status).toBe(200);
        expect(response.data.catalog_permission).toMatchObject({ seller_id: owner.sellerId, mode });
      }
      async function readPermission(admin: Actor, owner: Vendor) {
        const response = await request("GET", `/admin/catalog-permissions?seller_ids[]=${owner.sellerId}`, admin);
        expect(response.status).toBe(200);
        expect(response.data.catalog_permissions).toEqual([expect.objectContaining({ seller_id: owner.sellerId, mode: expect.any(String) })]);
        return response.data.catalog_permissions[0].mode as string;
      }
      function productInput(title = `Catalog product ${randomUUID()}`) {
        return { title, status: "proposed", attributes: [], variants: [{ title: "One", sku: `catalog-${randomUUID()}`, options: {} }] };
      }
      async function createProduct(owner: Vendor, body: object = productInput()) {
        const response = await request("POST", "/vendor/products", owner, body);
        expect(response.status).toBe(201);
        expect(response.data.product.id).toEqual(expect.any(String));
        return response.data.product;
      }
      async function commercialResources(owner: Vendor) {
        const { result: locations } = await createStockLocationsWorkflow(getContainer()).run({ input: {
          locations: [{ name: `Catalog warehouse ${randomUUID()}` }],
        } });
        await createLinksWorkflow(getContainer()).run({ input: [{
          [Modules.STOCK_LOCATION]: { stock_location_id: locations[0].id },
          [MercurModules.SELLER]: { seller_id: owner.sellerId },
        }] });
        await claimCatalogWarehouseFixtureWorkflow(getContainer()).run({ input: {
          seller_id: owner.sellerId, stock_location_id: locations[0].id,
        } });
        const { result: profiles } = await createSellerShippingProfilesWorkflow(getContainer()).run({ input: {
          seller_id: owner.sellerId, shipping_profiles: [{ name: `Catalog profile ${randomUUID()}`, type: "default" }],
        } });
        return { warehouseId: locations[0].id, profileId: profiles[0].id };
      }
      async function commercialProductInput(owner: Vendor, profileId: string) {
        const body = productInput();
        const { result: image } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: {
          sellerId: owner.sellerId, memberId: owner.memberId,
        } });
        return { ...body, images: [{ url: image.url }], additional_data: {
          initial_offers: [{ variant_sku: body.variants[0].sku, amount: 16.75, stocked_quantity: 7, shipping_profile_id: profileId }],
          initial_variant_images: [{ variant_sku: body.variants[0].sku, image_urls: [image.url] }],
        } };
      }
      async function persistedCommercialProduct(productId: string) {
        return (await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "offer", fields: ["id", "sku", "variant_id", "seller_id", "prices.amount", "prices.currency_code", "inventory_items.id", "inventory_items.location_levels.stocked_quantity", "inventory_items.location_levels.location_id"],
          filters: { product_id: productId },
        }, { cache: { enable: false } })).data;
      }
      async function readProduct(owner: Vendor, productId: string) {
        const response = await request("GET", `/vendor/products/${productId}`, owner);
        expect(response.status).toBe(200);
        return response.data.product;
      }
      async function persistedProduct(productId: string) {
        const client = new Client({ host: "localhost", port: 55432, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: dbName });
        await client.connect();
        try {
          await client.query("BEGIN READ ONLY");
          const product = (await client.query("SELECT id, title, status, thumbnail FROM product WHERE id = $1 AND deleted_at IS NULL", [productId])).rows[0];
          const changes = (await client.query("SELECT id, status, created_by, confirmed_by, confirmed_at FROM product_change WHERE product_id = $1 AND deleted_at IS NULL ORDER BY created_at, id", [productId])).rows;
          const actions = (await client.query("SELECT id, product_change_id, action, details FROM product_change_action WHERE product_id = $1 AND deleted_at IS NULL ORDER BY created_at, id", [productId])).rows;
          await client.query("COMMIT");
          return { product, changes, actions };
        } finally { await client.end(); }
      }
      async function persistedPermission(sellerId: string) {
        const client = new Client({ host: "localhost", port: 55432, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: dbName });
        await client.connect();
        try {
          await client.query("BEGIN READ ONLY");
          const tables = await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seller_catalog_permission'::regclass");
          expect(tables.rows).toEqual([{ relrowsecurity: true }]);
          const publicGrants = await client.query(`SELECT permission.privilege_type FROM pg_class relation
            CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) permission
            LEFT JOIN pg_roles actor ON actor.oid = permission.grantee
            WHERE relation.oid = 'public.seller_catalog_permission'::regclass
              AND (permission.grantee = 0 OR actor.rolname IN ('anon', 'authenticated'))`);
          expect(publicGrants.rows).toHaveLength(0);
          const records = await client.query("SELECT seller_id, mode, changed_by FROM seller_catalog_permission WHERE seller_id = $1 AND deleted_at IS NULL", [sellerId]);
          await client.query("COMMIT");
          return records.rows;
        } finally { await client.end(); }
      }
      async function confirmedChange(owner: Vendor, method: "POST" | "DELETE", url: string, body?: object) {
        const response = await request(method, url, owner, body);
        expect(response.status).toBe(202);
        expect(response.data.product_change).toMatchObject({ id: expect.any(String), status: "confirmed", created_by: owner.sellerId, confirmed_by: expect.any(String) });
        expect(response.data.product_change.actions.length).toBeGreaterThan(0);
        return response.data.product_change;
      }
      beforeEach(async () => {
        // The runner restores tables between cases after native bootstrap ran.
        await getContainer().resolve<InstanceType<typeof RbacModule.service>>(Modules.RBAC).__hooks.onApplicationStart();
        await restoreCatalogVendorRolesWorkflow(getContainer()).run({ input: undefined });
        const { data: stores } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "store", fields: ["id"] });
        await updateStoresWorkflow(getContainer()).run({ input: { selector: { id: stores[0].id }, update: { supported_currencies: [{ currency_code: "usd", is_default: true }] } } });
      });

      it("saves native price, stock and variant images while awaiting approval, then exposes the same offer upon confirmation", async () => {
        const owner = await vendor();
        const writer = await operator();
        const resources = await commercialResources(owner);
        const body = await commercialProductInput(owner, resources.profileId);
        const product = await createProduct(owner, body);
        expect(product.status).toBe("proposed");
        const [offer] = await persistedCommercialProduct(product.id);
        expect(offer).toMatchObject({ seller_id: owner.sellerId, variant_id: product.variants[0].id,
          prices: [expect.objectContaining({ amount: 16.75, currency_code: "usd" })],
          inventory_items: [expect.objectContaining({ location_levels: [expect.objectContaining({ stocked_quantity: 7, location_id: resources.warehouseId })] })],
        });
        expect(offer.sku).not.toBe(body.variants[0].sku);
        const { data: variants } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "product_variant", fields: ["id", "images.url"], filters: { id: product.variants[0].id },
        }, { cache: { enable: false } });
        expect(variants[0].images).toEqual([expect.objectContaining({ url: body.images[0].url })]);
        const { result: keys } = await createApiKeysWorkflow(getContainer()).run({ input: {
          api_keys: [{ title: "Disposable catalog offer visibility", type: "publishable", created_by: writer.userId }],
        } });
        const storeRequest = (url: string) => api.get(url, {
          headers: { "x-publishable-api-key": keys[0].token }, validateStatus: () => true,
        });
        expect((await storeRequest(`/store/offers?product_id=${product.id}`)).data.offers).toEqual([]);
        expect((await storeRequest(`/store/offers/${offer.id}`)).status).toBe(404);
        await expect(assertOffersNotPaused(getContainer(), [offer.id])).rejects.toThrow("not published");
        const update = await request("POST", `/vendor/offers/${offer.id}`, owner, { prices: [{ amount: 19.5, currency_code: "usd" }] });
        expect(update.status).toBe(200);
        expect((await request("POST", `/admin/products/${product.id}/confirm`, writer, {})).status).toBe(200);
        const visible = await storeRequest(`/store/offers?product_id=${product.id}`);
        expect(visible.status).toBe(200);
        expect(visible.data.offers.map((entry: { id: string }) => entry.id)).toEqual([offer.id]);
        expect((await storeRequest(`/store/offers/${offer.id}`)).status).toBe(200);
        await expect(assertOffersNotPaused(getContainer(), [offer.id])).resolves.toBeUndefined();
        expect((await persistedCommercialProduct(product.id))[0].prices).toEqual([expect.objectContaining({ amount: 19.5 })]);
      });

      it("keeps native profile ownership validation and compensates product creation when initial offers fail", async () => {
        const owner = await vendor();
        const foreign = await vendor();
        await commercialResources(owner);
        const resources = await commercialResources(foreign);
        const body = await commercialProductInput(owner, resources.profileId);
        const beforeOffers = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "offer", fields: ["id"], filters: { seller_id: owner.sellerId } });
        const response = await request("POST", "/vendor/products", owner, body);
        expect(response.status).toBe(400);
        expect(response.data).toMatchObject({ type: "not_allowed", message: "Offer references unavailable seller resources." });
        const { data: products } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "product", fields: ["id"], filters: { title: body.title },
        }, { cache: { enable: false } });
        expect(products).toEqual([]);
        expect((await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "offer", fields: ["id"], filters: { seller_id: owner.sellerId } })).data).toEqual(beforeOffers.data);
        expect((await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_variant", fields: ["id"], filters: { sku: body.variants[0].sku } })).data).toEqual([]);
      });

      it("creates initial offers before automatic publication and denies foreign pending product offers", async () => {
        const owner = await vendor();
        const other = await vendor();
        const writer = await operator();
        const resources = await commercialResources(owner);
        const otherResources = await commercialResources(other);
        const pending = await createProduct(owner, await commercialProductInput(owner, resources.profileId));
        const forbidden = await request("POST", "/vendor/offers", other, {
          sku: `foreign-${randomUUID()}`, variant_id: pending.variants[0].id, shipping_profile_id: otherResources.profileId,
          prices: [{ amount: 12, currency_code: "usd" }],
          inventory_items: [{ stock_levels: [{ location_id: otherResources.warehouseId, stocked_quantity: 1 }] }],
        });
        expect(forbidden.status).toBe(400);
        expect(forbidden.data).toMatchObject({ type: "not_allowed", message: "Offer references unavailable seller resources." });
        await permission(writer, owner, "authorized");
        const published = await createProduct(owner, await commercialProductInput(owner, resources.profileId));
        expect(published.status).toBe("published");
        expect(await persistedCommercialProduct(published.id)).toHaveLength(1);
      });

      it("distinguishes explicit variant image selections from general images through the native Store API and moderation", async () => {
        const owner = await vendor();
        const writer = await operator();
        const imageInputs = await Promise.all([0, 1].map(() => createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: {
          sellerId: owner.sellerId, memberId: owner.memberId,
        } })));
        const firstSku = `image-selection-${randomUUID()}`;
        const product = await createProduct(owner, {
          title: `Image selection product ${randomUUID()}`, status: "proposed",
          images: imageInputs.map(({ result }) => ({ url: result.url })),
          attributes: [{ title: "Size", type: AttributeType.MULTI_SELECT, is_variant_axis: true, values: ["Small", "Large"] }],
          variants: [
            { title: "Small", sku: firstSku, options: { Size: "Small" } },
            { title: "Large", sku: `image-selection-${randomUUID()}`, options: { Size: "Large" } },
          ],
          additional_data: { initial_variant_images: [{ variant_sku: firstSku, image_urls: [imageInputs[0].result.url] }] },
        });
        const small = product.variants.find((variant: { sku: string }) => variant.sku === firstSku);
        const large = product.variants.find((variant: { sku: string }) => variant.sku !== firstSku);
        const optionsUrl = `/vendor/products/${product.id}/catalog-options`;
        const initial = await request("GET", optionsUrl, owner);
        expect(initial.status).toBe(200);
        expect(initial.data.variants.find((variant: { id: string }) => variant.id === small.id).images)
          .toEqual([expect.objectContaining({ url: imageInputs[0].result.url })]);
        expect(initial.data.variants.find((variant: { id: string }) => variant.id === large.id).images).toEqual([]);
        const { result: channels } = await createSalesChannelsWorkflow(getContainer()).run({ input: { salesChannelsData: [{ name: `Image selection ${randomUUID()}` }] } });
        const { result: keys } = await createApiKeysWorkflow(getContainer()).run({ input: { api_keys: [{ title: "Disposable image selection", type: "publishable", created_by: writer.userId }] } });
        await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({ input: { id: keys[0].id, add: [channels[0].id] } });
        await createLinksWorkflow(getContainer()).run({ input: [{
          [Modules.PRODUCT]: { product_id: product.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id },
        }] });
        const storeRead = () => api.get(`/store/products/${product.id}?fields=id,images.id,images.url,images.rank,images.variants.id,variants.id,variants.images.id`, {
          headers: { "x-publishable-api-key": keys[0].token }, validateStatus: () => true,
        });
        expect((await storeRead()).status).toBe(404);
        expect((await request("POST", `/admin/products/${product.id}/confirm`, writer, {})).status).toBe(200);
        const visible = await storeRead();
        expect(visible.status).toBe(200);
        const firstImage = visible.data.product.images.find((image: { url: string }) => image.url === imageInputs[0].result.url);
        const secondImage = visible.data.product.images.find((image: { url: string }) => image.url === imageInputs[1].result.url);
        expect(firstImage.variants).toEqual([expect.objectContaining({ id: small.id })]);
        expect(secondImage.variants).toEqual([]);
        await permission(writer, owner, "authorized");
        await confirmedChange(owner, "POST", `/vendor/products/${product.id}/variants/${small.id}`, {
          images: { add: [secondImage.id], remove: [firstImage.id] },
        });
        const edited = await request("GET", optionsUrl, owner);
        expect(edited.data.variants.find((variant: { id: string }) => variant.id === small.id).images)
          .toEqual([expect.objectContaining({ id: secondImage.id })]);
        expect(edited.data.variants.find((variant: { id: string }) => variant.id === large.id).images).toEqual([]);
        const refreshed = await storeRead();
        expect(refreshed.data.product.images.find((image: { id: string }) => image.id === secondImage.id).variants)
          .toEqual([expect.objectContaining({ id: small.id })]);
        await confirmedChange(owner, "POST", `/vendor/products/${product.id}/variants/${small.id}`, {
          images: { remove: [secondImage.id] },
        });
        expect((await request("GET", optionsUrl, owner)).data.variants.every((variant: { images: unknown[] }) => variant.images.length === 0)).toBe(true);
        expect((await storeRead()).data.product.images.every((image: { variants: unknown[] }) => image.variants.length === 0)).toBe(true);
      });

      it("requires seller.update on an admin and ignores vendor metadata when deciding catalogue authority", async () => {
        const writer = await operator();
        const reader = await operator(true);
        const owner = await vendor();
        expect(await readPermission(reader, owner)).toBe("supervised");
        expect(await persistedPermission(owner.sellerId)).toEqual([]);
        const route = `/admin/sellers/${owner.sellerId}/catalog-permission`;
        expect((await request("POST", route, undefined, { mode: "authorized" })).status).toBe(401);
        expect((await request("POST", route, owner, { mode: "authorized" })).status).toBe(401);
        expect((await request("POST", route, reader, { mode: "authorized" })).status).toBe(403);
        expect((await request("POST", route, writer, { mode: "owner" })).status).toBe(400);
        expect((await request("POST", route, writer, { mode: "authorized", seller_id: "sel_forged" })).status).toBe(400);
        expect((await request("POST", "/admin/sellers/sel_missing_catalog_fixture/catalog-permission", writer, { mode: "authorized" })).status).toBe(404);
        const forged = await request("POST", `/vendor/sellers/${owner.sellerId}`, owner, { metadata: { catalog_review_mode: "authorized", catalog_permission: "authorized", fixture_note: "ordinary profile metadata" } });
        expect(forged.status).toBe(200);
        expect(await readPermission(reader, owner)).toBe("supervised");
        expect((await createProduct(owner)).status).toBe("proposed");
        await permission(writer, owner, "authorized");
        expect(await readPermission(reader, owner)).toBe("authorized");
        expect(await persistedPermission(owner.sellerId)).toEqual([{ seller_id: owner.sellerId, mode: "authorized", changed_by: writer.userId }]);
        const profile = await nativeSellers().retrieveSeller(owner.sellerId);
        expect(profile.metadata).toMatchObject({ fixture_note: "ordinary profile metadata" });
      });

      it("removes assigned photos from the unified product gallery only after review and restores links on failure", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const images = [] as {url: string}[];
        for (let index = 0; index < 3; index++) {
          const { result: image } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
          images.push({ url: image.url });
        }
        const variants = ["Small", "Large"].map(size => ({ title: size, sku: `gallery-${randomUUID()}`, options: { Size: size } }));
        const product = await createProduct(owner, {
          ...productInput(), images: images.slice(0, 2), thumbnail: images[0].url,
          attributes: [{ title: "Size", type: "multi_select", is_variant_axis: true, values: ["Small", "Large"] }], variants,
          additional_data: { initial_variant_images: variants.map((variant, index) => ({ variant_sku: variant.sku, image_urls: index ? [images[0].url, images[1].url] : [images[0].url] })) },
        });
        const url = `/vendor/products/${product.id}`;
        const retainedId = product.images.find((image: {id: string; url: string}) => image.url === images[1].url).id;
        const initialAssignments = [[images[0].url], [images[0].url, images[1].url]];
        const readAssignments = async () => (await request("GET", `${url}/catalog-options`, owner)).data.variants.sort((a: {title: string}, b: {title: string}) => b.title.localeCompare(a.title)).map((variant: {images: {url: string}[]}) => variant.images.map(image => image.url));
        expect(await readAssignments()).toEqual(initialAssignments);
        await permission(writer, owner, "supervised");
        expect((await request("POST", url, owner, {images: []})).status).toBe(400);
        const body = { images: [images[1]] };
        const pending = await request("POST", url, owner, body);
        expect(pending.status).toBe(202);
        expect((await readProduct(owner, product.id)).images).toHaveLength(2);
        expect(await readAssignments()).toEqual(initialAssignments);
        expect((await request("POST", `/admin/product-changes/${pending.data.product_change.id}/cancel`, writer, {})).status).toBe(200);
        expect(await readAssignments()).toEqual(initialAssignments);
        const retry = await request("POST", url, owner, body);
        expect(retry.status).toBe(202);
        const currentGallery = (await readProduct(owner, product.id)).images.map((image: {id: string; url: string}) => ({id: image.id, url: image.url}));
        await updateProductsWorkflow(getContainer()).run({ input: { products: [{ id: product.id, images: [...currentGallery, images[2]] }] } });
        expect(await readAssignments()).toEqual(initialAssignments);
        const editModule = getContainer().resolve<InstanceType<typeof ProductEditModule.service>>(MercurModules.PRODUCT_EDIT);
        const originalUpdate = editModule.updateProductChangeActions.bind(editModule);
        const failure = jest.spyOn(editModule, "updateProductChangeActions").mockImplementation(async input => {
          const rows = Array.isArray(input) ? input : [input];
          if (rows.some(row => row.applied === true)) throw new Error("Disposable gallery confirmation failure");
          return originalUpdate(input);
        });
        try {
          expect((await request("POST", `/admin/product-changes/${retry.data.product_change.id}/confirm`, writer, {})).status).toBe(500);
          expect((await readProduct(owner, product.id)).images.map((image: {url: string}) => image.url).sort()).toEqual(images.map(image => image.url).sort());
          expect(await readAssignments()).toEqual(initialAssignments);
        } finally { failure.mockRestore(); }
        expect((await request("POST", `/admin/product-changes/${retry.data.product_change.id}/confirm`, writer, {})).status).toBe(200);
        const after = await readProduct(owner, product.id);
        expect(after.images.map((image: {url: string}) => image.url).sort()).toEqual([images[1].url, images[2].url].sort());
        expect(after.thumbnail).toBe(images[1].url);
        expect(after.images).toEqual(expect.arrayContaining([expect.objectContaining({id: retainedId, url: images[1].url})]));
        expect(await readAssignments()).toEqual([[], [images[1].url]]);
        await permission(writer, owner, "authorized");
        const automatic = await request("POST", url, owner, {images: [images[2]]});
        expect(automatic.status).toBe(202);
        expect(automatic.data.product_change.status).toBe("confirmed");
        expect((await readProduct(owner, product.id)).images).toHaveLength(1);
        expect(await readAssignments()).toEqual([[], []]);
      });

      it("creates complete variants with two new axes only after review and preserves commercial drafts", async () => {
        const writer = await operator();
        const owner = await vendor();
        const outsider = await vendor();
        const resources = await commercialResources(owner);
        const foreignResources = await commercialResources(outsider);
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner, {
          ...productInput(),
          attributes: [
            { title: "Size", type: "multi_select", is_variant_axis: true, values: ["Small"] },
            { title: "Color", type: "multi_select", is_variant_axis: true, values: ["Red"] },
          ],
          variants: [{ title: "Small Red", sku: `complete-${randomUUID()}`, options: { Size: "Small", Color: "Red" } }],
        });
        await permission(writer, owner, "supervised");
        const { result: image } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
        const { result: foreign } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: outsider });
        const url = `/vendor/products/${product.id}/variant-configurations`;
        const body = {
          variant: { title: "Large Blue", sku: `complete-${randomUUID()}`, options: { Size: "Large", Color: "Blue" }, material: "PETG", weight: 125, length: 80, width: 70, height: 60, origin_country: "us" },
          images: { ids: [], uploads: [{ url: image.url }] },
          offer: { amount: 24.75, stocked_quantity: 13, shipping_profile_id: resources.profileId },
        };
        expect((await request("POST", url, outsider, body)).status).toBe(400);
        expect((await request("POST", url, owner, { ...body, images: { ids: [], uploads: [{ url: foreign.url }] } })).status).toBe(400);
        expect((await request("POST", url, owner, { ...body, offer: { ...body.offer, shipping_profile_id: foreignResources.profileId } })).status).toBe(400);
        expect((await request("POST", url, owner, { ...body, offer: { ...body.offer, stocked_quantity: -1 } })).status).toBe(400);
        const pending = await request("POST", url, owner, body);
        expect(pending.status).toBe(202);
        expect(pending.data.product_change.status).toBe("pending");
        expect((await readProduct(owner, product.id)).variants).toHaveLength(1);
        expect(await persistedCommercialProduct(product.id)).toHaveLength(0);
        const pendingOptions = await request("GET", `/vendor/products/${product.id}/catalog-options`, owner);
        expect(pendingOptions.data.options.flatMap((option: { values: { value: string }[] }) => option.values.map(value => value.value))).toEqual(expect.arrayContaining(["Small", "Red"]));
        expect((await request("POST", url, owner, body)).status).toBe(400);
        expect((await request("POST", `/admin/product-changes/${pending.data.product_change.id}/cancel`, writer, {})).status).toBe(200);
        expect((await readProduct(owner, product.id)).variants).toHaveLength(1);
        const retry = await request("POST", url, owner, body);
        expect(retry.status).toBe(202);
        const { result: concurrent } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
        await updateProductsWorkflow(getContainer()).run({ input: { products: [{ id: product.id, images: [{ url: concurrent.url }] }] } });
        const offersModule = getContainer().resolve<InstanceType<typeof OfferModule.service>>(MercurModules.OFFER);
        const failedOffer = jest.spyOn(offersModule, "createOffers").mockRejectedValueOnce(new Error("Disposable complete variant offer failure"));
        try {
          const failure = await request("POST", `/admin/product-changes/${retry.data.product_change.id}/confirm`, writer, {});
          expect(failure.status).toBe(500);
          expect((await readProduct(owner, product.id)).variants).toHaveLength(1);
          expect((await readProduct(owner, product.id)).images).toEqual([expect.objectContaining({ url: concurrent.url })]);
          expect(await persistedCommercialProduct(product.id)).toHaveLength(0);
          const rolledBackOptions = await request("GET", `/vendor/products/${product.id}/catalog-options`, owner);
          expect(rolledBackOptions.data.options.flatMap((option: { values: { value: string }[] }) => option.values.map(value => value.value)).sort()).toEqual(["Red", "Small"]);
          const rolledBackChange = (await persistedProduct(product.id)).changes.find(change => change.id === retry.data.product_change.id);
          expect(rolledBackChange?.status).toBe("pending");
        } finally { failedOffer.mockRestore(); }
        const approved = await request("POST", `/admin/product-changes/${retry.data.product_change.id}/confirm`, writer, {});
        expect(approved.status).toBe(200);
        const after = await readProduct(owner, product.id);
        expect(after.variants).toHaveLength(2);
        const created = after.variants.find((variant: { sku: string }) => variant.sku === body.variant.sku);
        const { data: actualVariants } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_variant", fields: ["id", "title", "material", "weight", "length", "width", "height", "origin_country", "options.value"], filters: { id: created.id } }, { cache: { enable: false } });
        expect(actualVariants[0]).toMatchObject({ title: "Large Blue", material: "PETG", weight: 125, length: 80, width: 70, height: 60, origin_country: "us" });
        expect(actualVariants[0].options?.map(value => value?.value)).toEqual(expect.arrayContaining(["Large", "Blue"]));
        expect(after.images).toEqual(expect.arrayContaining([expect.objectContaining({ url: image.url }), expect.objectContaining({ url: concurrent.url })]));
        const commercial = await persistedCommercialProduct(product.id);
        expect(commercial).toEqual([expect.objectContaining({ variant_id: created.id, seller_id: owner.sellerId, prices: [expect.objectContaining({ amount: 24.75, currency_code: "usd" })], inventory_items: [expect.objectContaining({ location_levels: [expect.objectContaining({ stocked_quantity: 13, location_id: resources.warehouseId })] })] })]);
        const options = await request("GET", `/vendor/products/${product.id}/catalog-options`, owner);
        expect(options.data.variants.find((variant: { id: string }) => variant.id === created.id).images).toEqual([expect.objectContaining({ url: image.url })]);
        await permission(writer, owner, "authorized");
        const automatic = await request("POST", url, owner, { ...body, variant: { ...body.variant, sku: `complete-${randomUUID()}`, title: "Small Blue", options: { Size: "Small", Color: "Blue" } }, images: { ids: [], uploads: [] }, offer: { ...body.offer, amount: 0, stocked_quantity: 0 } });
        expect(automatic.status).toBe(202);
        expect(automatic.data.product_change.status).toBe("confirmed");
        expect((await readProduct(owner, product.id)).variants).toHaveLength(3);
        expect(await persistedCommercialProduct(product.id)).toHaveLength(2);
        expect((await request("POST", url, owner, body)).status).toBe(400);
      });

      it("preserves supervised proposal, pending changes and existing catalogue validation", async () => {
        const owner = await vendor();
        const product = await createProduct(owner);
        expect(product.status).toBe("proposed");
        const updated = await request("POST", `/vendor/products/${product.id}`, owner, { title: "Pending supervised title" });
        expect(updated.status).toBe(202);
        expect(updated.data.product_change).toMatchObject({ status: "pending", created_by: owner.sellerId, confirmed_at: null });
        const stored = await persistedProduct(product.id);
        expect(stored.product.title).toBe(product.title);
        expect(stored.product.status).toBe("proposed");
        expect(stored.changes.filter(change => change.status === "pending")).toHaveLength(1);
        expect((await request("POST", "/vendor/products", owner, { ...productInput(), status: "published" })).status).toBe(400);
        expect((await request("POST", "/vendor/products", owner, { ...productInput(), categories: [{ id: "pcat_missing_catalog_fixture" }] })).status).toBe(400);
        const foreignImage = await request("POST", "/vendor/products", owner, { ...productInput(), thumbnail: "https://example.invalid/foreign-image.jpg" });
        expect(foreignImage.status).toBe(400);
        expect(foreignImage.data).toMatchObject({ type: "not_allowed", message: "Catalog image access is not permitted." });
      });

      it("publishes authorized additions and applies edits with native change actions and audit", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        expect(product.status).toBe("published");
        const initial = await persistedProduct(product.id);
        expect(initial.product.status).toBe("published");
        expect(initial.actions.map(action => action.action)).toContain("PRODUCT_ADD");
        expect(initial.actions.map(action => action.action)).toContain("STATUS_CHANGE");
        expect(initial.changes.every(change => change.status === "confirmed" && change.confirmed_at)).toBe(true);
        const edit = await confirmedChange(owner, "POST", `/vendor/products/${product.id}`, { title: "Authorized title", description: "Immediate authorized description" });
        expect(edit.actions.map((action: { action: string }) => action.action)).toEqual(expect.arrayContaining(["UPDATE"]));
        const after = await persistedProduct(product.id);
        expect(after.product.title).toBe("Authorized title");
        expect(after.product.status).toBe("published");
        expect(after.changes.filter(change => change.id === edit.id)).toHaveLength(1);
        expect(after.changes.every(change => change.status === "confirmed")).toBe(true);
        expect((await readProduct(owner, product.id)).description).toBe("Immediate authorized description");
      });

      it("allows product.update operators to edit, withdraw and republish without bypassing version checks", async () => {
        const writer = await operator();
        const reader = await operator(true);
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        const url = `/admin/catalog-products/${product.id}/manage`;
        const initial = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const withdrawal = { action: "withdraw", expected_updated_at: initial.updated_at };
        expect((await request("POST", url, undefined, withdrawal)).status).toBe(401);
        expect((await request("POST", url, owner, withdrawal)).status).toBe(401);
        expect((await request("POST", url, reader, withdrawal)).status).toBe(403);
        expect((await request("POST", url, writer, { ...withdrawal, status: "draft" })).status).toBe(400);

        const content = { title: "Operator edited content", subtitle: null, description: "Operator description" };
        const edited = await request("POST", url, writer, {
          action: "update-content", expected_updated_at: initial.updated_at, content,
        });
        expect(edited.status).toBe(200);
        expect(edited.data.product).toMatchObject({ id: product.id, status: "published", ...content });
        const stale = await request("POST", url, writer, withdrawal);
        expect(stale.status).toBe(409);
        expect(stale.data).toMatchObject({ code: "catalog_product_changed", message: "catalog_product_changed" });
        const withdrawn = await request("POST", url, writer, {
          action: "withdraw", expected_updated_at: edited.data.product.updated_at,
        });
        expect(withdrawn.status).toBe(200);
        expect(withdrawn.data.product).toMatchObject({ id: product.id, title: content.title, status: "draft" });
        expect((await persistedProduct(product.id)).product.status).toBe("draft");
        const published = await request("POST", url, writer, {
          action: "publish", expected_updated_at: withdrawn.data.product.updated_at,
        });
        expect(published.status).toBe(200);
        expect((await persistedProduct(product.id)).product).toMatchObject({ id: product.id, title: content.title, status: "published" });
        expect((await readProduct(owner, product.id)).description).toBe(content.description);
      });

      it("blocks operator management while seller changes are pending and preserves native cancellation", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        await permission(writer, owner, "supervised");
        const pending = await request("POST", `/vendor/products/${product.id}`, owner, { title: "Seller pending title" });
        expect(pending.status).toBe(202);
        const current = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const url = `/admin/catalog-products/${product.id}/manage`;
        for (const action of ["withdraw", "publish", "update-content"]) {
          const result = await request("POST", url, writer, {
            action, expected_updated_at: current.updated_at,
            ...(action === "update-content" ? { content: { title: "Operator title", subtitle: null, description: null } } : {}),
          });
          expect(result.status).toBe(409);
          expect(result.data).toMatchObject({ code: "catalog_pending_change" });
        }
        expect((await persistedProduct(product.id)).product).toMatchObject({ title: product.title, status: "published" });
        const cancelled = await request("POST", `/admin/product-changes/${pending.data.product_change.id}/cancel`, writer, {});
        expect(cancelled.status).toBe(200);
        expect(cancelled.data.product_change).toMatchObject({ id: pending.data.product_change.id, status: "canceled" });
        const fresh = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const withdrawal = await request("POST", url, writer, { action: "withdraw", expected_updated_at: fresh.updated_at });
        expect(withdrawal.status).toBe(200);
      });

      it("coordinates operator management with native confirmation without overwriting the reviewed seller content", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        await permission(writer, owner, "supervised");
        const before = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const pending = await request("POST", `/vendor/products/${product.id}`, owner, { title: "Reviewed seller content" });
        expect(pending.status).toBe(202);
        const [managed, confirmed] = await Promise.all([
          request("POST", `/admin/catalog-products/${product.id}/manage`, writer, {
            action: "update-content", expected_updated_at: before.updated_at,
            content: { title: "Stale operator content", subtitle: null, description: null },
          }),
          request("POST", `/admin/product-changes/${pending.data.product_change.id}/confirm`, writer, {}),
        ]);
        expect(managed.status).toBe(409);
        expect(["catalog_pending_change", "catalog_product_changed"]).toContain(managed.data.code);
        expect(confirmed.status).toBe(200);
        const stored = await persistedProduct(product.id);
        expect(stored.product.title).toBe("Reviewed seller content");
        expect(stored.changes.some(change => change.status === "pending")).toBe(false);
      });

      it("applies authorized variants, attributes and owned images while rejecting invalid ownership and options", async () => {
        const writer = await operator();
        const owner = await vendor();
        const other = await vendor();
        await permission(writer, owner, "authorized");
        const { result: ownedImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
        const { result: foreignImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: other });
        const product = await createProduct(owner, {
          title: `Axis fixture ${randomUUID()}`, status: "proposed",
          attributes: [{ title: "Size", type: "multi_select", is_variant_axis: true, values: ["Small", "Medium"] }],
          variants: [{ title: "Small", sku: `catalog-${randomUUID()}`, options: { Size: "Small" } }],
          images: [{ url: ownedImage.url }], thumbnail: ownedImage.url,
        });
        const base = `/vendor/products/${product.id}`;
        await confirmedChange(owner, "POST", `${base}/variants`, { title: "Medium", sku: `catalog-${randomUUID()}`, options: { Size: "Medium" } });
        const medium = (await readProduct(owner, product.id)).variants.find((variant: { title: string }) => variant.title === "Medium");
        expect(medium.id).toEqual(expect.any(String));
        await confirmedChange(owner, "POST", `${base}/variants/${medium.id}`, { title: "Medium revised" });
        await confirmedChange(owner, "POST", `${base}/attributes/batch`, { add: [{ title: "Specification", type: "text", value: "Original" }] });
        const { data: products } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "product", fields: ["id", "product_attribute_values.name", "product_attribute_values.attribute.id", "product_attribute_values.attribute.name"], filters: { id: product.id },
        }, { cache: { enable: false } });
        const specification = products[0].product_attribute_values?.find(value => value?.attribute?.name === "Specification");
        expect(specification?.name).toBe("Original");
        const attributeId = specification!.attribute!.id;
        await confirmedChange(owner, "POST", `${base}/attributes/batch`, { update: [{ id: attributeId, value: "Revised" }] });
        const withImages = await readProduct(owner, product.id);
        const imageId = withImages.images[0].id;
        await confirmedChange(owner, "POST", `${base}/variants/${medium.id}`, { images: { add: [imageId] } });
        const variant = await request("GET", `${base}/variants/${medium.id}`, owner);
        expect(variant.status).toBe(200);
        expect(variant.data.variant.images).toEqual([expect.objectContaining({ id: imageId, url: ownedImage.url })]);
        const beforeInvalid = await persistedProduct(product.id);
        const foreignGallery = await request("POST", base, owner, { images: [{ url: foreignImage.url }], thumbnail: foreignImage.url });
        expect(foreignGallery.status).toBe(400);
        expect(foreignGallery.data).toMatchObject({ type: "not_allowed", message: "Catalog image access is not permitted." });
        expect((await request("POST", `${base}/variants/${medium.id}`, owner, { images: { add: ["img_foreign_fixture"] } })).status).toBe(400);
        expect((await request("POST", `${base}/variants`, owner, { title: "Wrong axis", sku: `catalog-${randomUUID()}`, options: { Size: "Missing" } })).status).toBe(400);
        expect((await request("POST", `${base}/variants/${medium.id}`, owner, { manage_inventory: true })).status).toBe(400);
        expect(await persistedProduct(product.id)).toEqual(beforeInvalid);
        await confirmedChange(owner, "POST", `${base}/attributes/batch`, { remove: [attributeId] });
        await confirmedChange(owner, "DELETE", `${base}/variants/${medium.id}`);
        expect((await readProduct(owner, product.id)).variants.map((variant: { id: string }) => variant.id)).not.toContain(medium.id);
        const finalState = await persistedProduct(product.id);
        expect(finalState.changes.every(change => change.status === "confirmed")).toBe(true);
        expect(finalState.actions.map(action => action.action)).toEqual(expect.arrayContaining(["VARIANT_ADD", "VARIANT_UPDATE", "VARIANT_REMOVE", "ATTRIBUTE_ADD", "ATTRIBUTE_UPDATE", "ATTRIBUTE_REMOVE"]));
      });

      it("adds uploaded images to single and multiple variants in one moderated change without replacing their gallery", async () => {
        const writer = await operator();
        const owner = await vendor();
        const other = await vendor();
        await permission(writer, owner, "authorized");
        const { result: generalImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
        const { result: foreignImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: other });
        for (const multiple of [false, true]) {
          const product = await createProduct(owner, {
            title: `Uploaded variant fixture ${randomUUID()}`, status: "proposed",
            attributes: multiple ? [{ title: "Size", type: "multi_select", is_variant_axis: true, values: ["Small", "Large"] }] : [],
            variants: multiple ? [
              { title: "Small", sku: `catalog-${randomUUID()}`, options: { Size: "Small" } },
              { title: "Large", sku: `catalog-${randomUUID()}`, options: { Size: "Large" } },
            ] : [{ title: "Single", sku: `catalog-${randomUUID()}`, options: {} }],
            images: [{ url: generalImage.url }], thumbnail: generalImage.url,
          });
          const initial = await readProduct(owner, product.id);
          const variantId = initial.variants[0].id;
          const url = `/vendor/products/${product.id}/variants/${variantId}/media`;
          const { result: uploadedImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
          const invalidState = await persistedProduct(product.id);
          expect((await request("POST", url, owner, { variant: {}, images: { ids: [], uploads: [{ url: foreignImage.url }] } })).status).toBe(400);
          expect((await request("POST", url, owner, { variant: {}, images: { ids: ["img_foreign"], uploads: [{ url: uploadedImage.url }] } })).status).toBe(400);
          expect((await request("POST", url.replace(variantId, "variant_foreign"), owner, { variant: {}, images: { ids: [], uploads: [{ url: uploadedImage.url }] } })).status).toBe(400);
          expect(await persistedProduct(product.id)).toEqual(invalidState);
          await permission(writer, owner, "supervised");
          const pending = await request("POST", url, owner, { variant: { title: "Reviewed photo variant" }, images: { ids: [], uploads: [{ url: uploadedImage.url }] } });
          expect(pending.status).toBe(202);
          expect(pending.data.product_change.status).toBe("pending");
          expect(pending.data.product_change.actions.map((action: { action: string }) => action.action)).toEqual(["UPDATE", "VARIANT_UPDATE"]);
          expect((await readProduct(owner, product.id)).images).toEqual(initial.images);
          expect((await request("POST", url, owner, { variant: {}, images: { ids: [], uploads: [{ url: uploadedImage.url }] } })).status).toBe(400);
          expect((await request("POST", `/admin/product-changes/${pending.data.product_change.id}/confirm`, writer, {})).status).toBe(200);
          const confirmed = await readProduct(owner, product.id);
          expect(confirmed.images).toHaveLength(2);
          expect(confirmed.images.map((image: { url: string }) => image.url)).toEqual(expect.arrayContaining([generalImage.url, uploadedImage.url]));
          expect(confirmed.thumbnail).toBe(generalImage.url);
          const options = (await request("GET", `/vendor/products/${product.id}/catalog-options`, owner)).data;
          expect(options.variants.find((variant: { id: string }) => variant.id === variantId)).toMatchObject({ title: "Reviewed photo variant", images: [expect.objectContaining({ url: uploadedImage.url })] });
          if (multiple) expect(options.variants.find((variant: { id: string }) => variant.id !== variantId).images).toEqual([]);
          await permission(writer, owner, "authorized");
          const secondImages: { url: string }[] = [];
          for (let index = 0; index < 5; index++) {
            const { result: image } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
            secondImages.push({ url: image.url });
          }
          const assignedId = options.variants.find((variant: { id: string }) => variant.id === variantId).images[0].id;
          const automatic = await request("POST", url, owner, { variant: {}, images: { ids: [assignedId], uploads: secondImages } });
          expect(automatic.status).toBe(202);
          expect(automatic.data.product_change.status).toBe("confirmed");
          const withVariantPhotos = await readProduct(owner, product.id);
          expect(withVariantPhotos.images).toHaveLength(7);
          const { result: newGeneralImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
          await confirmedChange(owner, "POST", `/vendor/products/${product.id}`, {
            images: [...withVariantPhotos.images.map((image: { id: string; url: string }) => ({ id: image.id, url: image.url })), { url: newGeneralImage.url }],
          });
          expect((await readProduct(owner, product.id)).images).toHaveLength(8);
          const preserved = (await request("GET", `/vendor/products/${product.id}/catalog-options`, owner)).data;
          expect(preserved.variants.find((variant: { id: string }) => variant.id === variantId).images).toHaveLength(6);
        }
      });

      it("persists independent variant specifications and nullable inheritance through native moderation", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const general = { material: "PLA", weight: 120.5, length: 12, width: 8, height: 15 };
        const override = { material: "PETG", weight: 180.25, length: 14, width: 9, height: 18 };
        const inherited = { material: null, weight: null, length: null, width: null, height: null };
        const product = await createProduct(owner, {
          title: `Physical variant fixture ${randomUUID()}`, status: "proposed", ...general,
          attributes: [{ title: "Size", type: "multi_select", is_variant_axis: true, values: ["Small", "Medium", "Large"] }],
          variants: [
            { title: "Small", sku: `catalog-${randomUUID()}`, options: { Size: "Small" }, ...override },
            { title: "Medium", sku: `catalog-${randomUUID()}`, options: { Size: "Medium" } },
          ],
        });
        const base = `/vendor/products/${product.id}`;
        const readOptions = async () => {
          const response = await request("GET", `${base}/catalog-options`, owner);
          expect(response.status).toBe(200);
          return response.data;
        };
        const initial = await readOptions();
        expect(initial.product).toMatchObject(general);
        const small = initial.variants.find((variant: { title: string }) => variant.title === "Small");
        const medium = initial.variants.find((variant: { title: string }) => variant.title === "Medium");
        expect(small).toMatchObject(override);
        expect(medium).toMatchObject(inherited);
        await confirmedChange(owner, "POST", `${base}/variants`, {
          title: "Large", sku: `catalog-${randomUUID()}`, options: { Size: "Large" }, ...override,
        });
        expect((await readOptions()).variants.find((variant: { title: string }) => variant.title === "Large")).toMatchObject(override);

        await permission(writer, owner, "supervised");
        const reset = await request("POST", `${base}/variants/${small.id}`, owner, inherited);
        expect(reset.status).toBe(202);
        expect(reset.data.product_change.status).toBe("pending");
        expect(reset.data.product_change.actions).toEqual(expect.arrayContaining([
          expect.objectContaining({ action: "VARIANT_UPDATE", details: expect.objectContaining({ fields: inherited, previous_fields: override }) }),
        ]));
        expect((await readOptions()).variants.find((variant: { id: string }) => variant.id === small.id)).toMatchObject(override);
        const confirmed = await request("POST", `/admin/product-changes/${reset.data.product_change.id}/confirm`, writer, {});
        expect(confirmed.status).toBe(200);
        expect((await readOptions()).variants.find((variant: { id: string }) => variant.id === small.id)).toMatchObject(inherited);

        await permission(writer, owner, "authorized");
        const changedGeneral = { material: "PLA reciclado", weight: 140, length: 13, width: 9, height: 16 };
        await confirmedChange(owner, "POST", base, changedGeneral);
        const changed = await readOptions();
        expect(changed.product).toMatchObject(changedGeneral);
        expect(changed.variants.find((variant: { id: string }) => variant.id === small.id)).toMatchObject(inherited);
        expect(changed.variants.find((variant: { id: string }) => variant.id === medium.id)).toMatchObject(inherited);
        expect(changed.variants.find((variant: { title: string }) => variant.title === "Large")).toMatchObject(override);
        const persisted = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "product_variant", fields: ["id", "material", "weight", "length", "width", "height"], filters: { id: small.id },
        }, { cache: { enable: false } });
        expect(persisted.data[0]).toMatchObject(inherited);
      });

      it("rejects invalid physical specifications before creating or staging catalogue changes", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        const base = `/vendor/products/${product.id}`;
        const before = await persistedProduct(product.id);
        for (const invalid of [{ weight: 0 }, { length: -1 }, { width: "10" }, { height: 0 }, { material: " " }, { material: "x".repeat(201) }]) {
          const creation = productInput();
          expect((await request("POST", "/vendor/products", owner, {
            ...creation, variants: [{ ...creation.variants[0], ...invalid }],
          })).status).toBe(400);
          expect((await request("POST", base, owner, invalid)).status).toBe(400);
          expect((await request("POST", `${base}/variants`, owner, {
            title: "Invalid physical variant", sku: `catalog-${randomUUID()}`, ...invalid,
          })).status).toBe(400);
          expect((await request("POST", `${base}/variants/${product.variants[0].id}`, owner, invalid)).status).toBe(400);
        }
        expect(await persistedProduct(product.id)).toEqual(before);
      });

      it("leaves old pending proposals for review and applies revocation immediately to later writes", async () => {
        const writer = await operator();
        const owner = await vendor();
        const pendingProduct = await createProduct(owner);
        const pendingEdit = await request("POST", `/vendor/products/${pendingProduct.id}`, owner, { title: "Old pending title" });
        expect(pendingEdit.status).toBe(202);
        const beforeGrant = await persistedProduct(pendingProduct.id);
        await permission(writer, owner, "authorized");
        expect(await persistedProduct(pendingProduct.id)).toEqual(beforeGrant);
        expect((await readProduct(owner, pendingProduct.id)).status).toBe("proposed");
        const authorizedProduct = await createProduct(owner);
        expect(authorizedProduct.status).toBe("published");
        expect((await request("POST", `/vendor/sellers/${owner.sellerId}`, owner, { metadata: null })).status).toBe(200);
        expect(await readPermission(writer, owner)).toBe("authorized");
        await permission(writer, owner, "supervised");
        expect(await readPermission(writer, owner)).toBe("supervised");
        const revoked = await request("POST", `/vendor/products/${authorizedProduct.id}`, owner, { title: "Requires approval after revocation" });
        expect(revoked.status).toBe(202);
        expect(revoked.data.product_change.status).toBe("pending");
        expect((await readProduct(owner, authorizedProduct.id)).title).toBe(authorizedProduct.title);
        expect((await createProduct(owner)).status).toBe("proposed");
        expect(await persistedProduct(pendingProduct.id)).toEqual(beforeGrant);
      });

      it("keeps native shared published catalogue editable while denying foreign private proposals and forged seller context", async () => {
        const writer = await operator();
        const owner = await vendor();
        const other = await vendor();
        const privateProduct = await createProduct(other);
        await permission(writer, owner, "authorized");
        const { result: sharedProducts } = await createProductsWorkflow(getContainer()).run({ input: {
          created_by: writer.userId,
          products: [{ ...productInput("Shared published fixture"), status: ProductStatus.PUBLISHED }],
        } });
        const shared = sharedProducts[0];
        await confirmedChange(owner, "POST", `/vendor/products/${shared.id}`, { title: "Authorized shared title" });
        expect((await persistedProduct(shared.id)).product.title).toBe("Authorized shared title");
        const beforeForeign = await persistedProduct(privateProduct.id);
        for (const suffix of ["", "/preview", "/variants", `/variants/${privateProduct.variants[0].id}`]) {
          expect((await request("GET", `/vendor/products/${privateProduct.id}${suffix}`, owner)).status).toBe(404);
        }
        expect((await request("POST", `/vendor/products/${privateProduct.id}`, owner, { title: "Unauthorized private edit" })).status).toBe(404);
        expect((await request("GET", `/vendor/products/${privateProduct.id}`, { ...owner, sellerId: other.sellerId })).status).toBe(400);
        expect(await persistedProduct(privateProduct.id)).toEqual(beforeForeign);
      });

      it("product lifecycle preserves commercial data across withdrawal and restoration, then archives native offers", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const resources = await commercialResources(owner);
        const product = await createProduct(owner, await commercialProductInput(owner, resources.profileId));
        const base = `/vendor/product-lifecycle/${product.id}`;
        const initialOffers = await persistedCommercialProduct(product.id);
        expect(initialOffers).toHaveLength(1);
        const { result: channels } = await createSalesChannelsWorkflow(getContainer()).run({ input: { salesChannelsData: [{ name: `Lifecycle visibility ${randomUUID()}` }] } });
        const { result: keys } = await createApiKeysWorkflow(getContainer()).run({ input: { api_keys: [{ title: "Disposable lifecycle visibility", type: "publishable", created_by: writer.userId }] } });
        await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({ input: { id: keys[0].id, add: [channels[0].id] } });
        await createLinksWorkflow(getContainer()).run({ input: [{
          [Modules.PRODUCT]: { product_id: product.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id },
        }] });
        const storeRead = () => api.get(`/store/products/${product.id}?fields=id,title`, { headers: { "x-publishable-api-key": keys[0].token }, validateStatus: () => true });
        expect((await storeRead()).status).toBe(200);
        expect((await request("GET", base, owner)).data).toMatchObject({ can_manage: true, requires_review: false, status: "published" });
        const withdrawn = await request("POST", `${base}/visibility`, owner, { active: false });
        expect(withdrawn.status).toBe(200);
        expect(withdrawn.data).toMatchObject({ applied: true, operation: "deactivate" });
        expect((await persistedProduct(product.id)).product.status).toBe("draft");
        expect((await storeRead()).status).toBe(404);
        await expect(assertOffersNotPaused(getContainer(), initialOffers.map(offer => offer.id))).rejects.toThrow("not published");
        expect(await persistedCommercialProduct(product.id)).toEqual(initialOffers);
        expect((await request("GET", base, owner)).data).toMatchObject({ can_activate: true, status: "draft" });
        const restored = await request("POST", `${base}/visibility`, owner, { active: true });
        expect(restored.status).toBe(200);
        expect(restored.data).toMatchObject({ applied: true, operation: "activate" });
        expect((await persistedProduct(product.id)).product.status).toBe("published");
        expect((await storeRead()).status).toBe(200);
        expect(await persistedCommercialProduct(product.id)).toEqual(initialOffers);
        const archived = await request("POST", `${base}/archive`, owner, {});
        expect(archived.status).toBe(200);
        expect(archived.data).toMatchObject({ applied: true, operation: "archive" });
        expect((await persistedProduct(product.id)).product).toBeUndefined();
        expect((await storeRead()).status).toBe(404);
        expect(await persistedCommercialProduct(product.id)).toHaveLength(0);
      });

      it("product lifecycle preserves native review and prevents changes to other sellers' shared masters", async () => {
        const writer = await operator();
        const owner = await vendor();
        const other = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        const base = `/vendor/product-lifecycle/${product.id}`;
        expect((await request("GET", base, other)).data.can_manage).toBe(false);
        const foreignArchive = await request("POST", `${base}/archive`, other, {});
        expect(foreignArchive.status).toBe(400);
        expect(foreignArchive.data.type).toBe("not_allowed");
        const shared = await createProduct(owner);
        await createLinksWorkflow(getContainer()).run({ input: [{
          [Modules.PRODUCT]: { product_id: shared.id }, [MercurModules.SELLER]: { seller_id: other.sellerId },
        }] });
        const sharedBase = `/vendor/product-lifecycle/${shared.id}`;
        expect((await request("GET", sharedBase, owner)).data.can_manage).toBe(false);
        expect((await request("POST", `${sharedBase}/visibility`, owner, { active: false })).data.type).toBe("not_allowed");
        expect((await request("POST", `${sharedBase}/archive`, owner, {})).data.type).toBe("not_allowed");
        expect((await persistedProduct(shared.id)).product.status).toBe("published");
        await permission(writer, owner, "supervised");
        expect((await request("GET", base, owner)).data.requires_review).toBe(true);
        const withdrawal = await request("POST", `${base}/visibility`, owner, { active: false });
        expect(withdrawal.status).toBe(202);
        expect(withdrawal.data.applied).toBe(false);
        expect((await persistedProduct(product.id)).product.status).toBe("published");
        const confirmed = await request("POST", `/admin/product-changes/${withdrawal.data.product_change_id}/confirm`, writer, {});
        expect(confirmed.status).toBe(200);
        expect((await persistedProduct(product.id)).product.status).toBe("draft");
        const neverPublished = await createProduct(owner);
        expect((await request("GET", `/vendor/product-lifecycle/${neverPublished.id}`, other)).status).toBe(404);
        expect((await request("POST", `/vendor/product-lifecycle/${neverPublished.id}/archive`, other, {})).status).toBe(404);
        const prematurePublication = await request("POST", `/vendor/product-lifecycle/${neverPublished.id}/visibility`, owner, { active: true });
        expect(prematurePublication.status).toBe(400);
        expect(prematurePublication.data.type).toBe("not_allowed");
        expect((await persistedProduct(neverPublished.id)).product.status).toBe("proposed");
      });

      it("serializes concurrent authorized edits of a shared product and prevents duplicate variant combinations", async () => {
        const writer = await operator();
        const first = await vendor();
        const second = await vendor();
        await permission(writer, first, "authorized");
        await permission(writer, second, "authorized");
        const { result: products } = await createProductsWorkflow(getContainer()).run({ input: {
          created_by: writer.userId,
          products: [{
            title: `Shared concurrency fixture ${randomUUID()}`, status: ProductStatus.PUBLISHED,
            attributes: [{ title: "Size", type: AttributeType.MULTI_SELECT, is_variant_axis: true, values: ["Small", "Medium"] }],
            variants: [{ title: "Small", sku: `catalog-${randomUUID()}`, options: { Size: "Small" } }],
          }],
        } });
        const product = products[0];
        const before = await persistedProduct(product.id);
        const skus = [`catalog-first-${randomUUID()}`, `catalog-second-${randomUUID()}`];
        const outcomes = await Promise.all([first, second].map((actor, index) => request("POST", `/vendor/products/${product.id}/variants`, actor, {
          title: `Medium ${index}`, sku: skus[index], options: { Size: "Medium" },
        })));
        expect(outcomes.map(outcome => outcome.status).sort()).toEqual([202, 400]);
        const accepted = outcomes.find(outcome => outcome.status === 202)!;
        expect(accepted.data.product_change).toMatchObject({ status: "confirmed", confirmed_by: expect.any(String) });
        const rejected = outcomes.find(outcome => outcome.status === 400)!;
        expect(rejected.data).toMatchObject({ type: "invalid_data", message: "Duplicate variant combination." });
        const current = await readProduct(first, product.id);
        expect(current.status).toBe("published");
        expect(current.variants).toHaveLength(2);
        expect(current.variants.filter((variant: { sku: string }) => skus.includes(variant.sku))).toHaveLength(1);
        const after = await persistedProduct(product.id);
        expect(after.changes).toHaveLength(before.changes.length + 1);
        expect(after.changes.every(change => change.status === "confirmed")).toBe(true);
        expect(after.actions.filter(action => action.action === "VARIANT_ADD")).toHaveLength(1);
      });
    },
  });
}
