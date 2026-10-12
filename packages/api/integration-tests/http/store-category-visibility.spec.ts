/**
 * Real native workflows and HTTP; opt in with
 * STORE_CATEGORY_VISIBILITY_TESTS=disposable-local on exclusive localhost
 * PostgreSQL:55432 and TLS Redis:56379/15. The runner creates and drops only
 * its random database/template. External providers must remain disabled.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { IAuthModuleService } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  PolicyOperation,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRbacPoliciesWorkflow,
  createRbacRolesWorkflow,
  createSalesChannelsWorkflow,
  createUsersWorkflow,
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateProductsWorkflow,
} from "@medusajs/core-flows";
import {
  approveSellerWorkflow,
  createSellerAccountWorkflow,
} from "@mercurjs/core/workflows";
import { ProductStatus } from "@mercurjs/types";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

const enabled =
  process.env.STORE_CATEGORY_VISIBILITY_TESTS === "disposable-local";

if (!enabled) {
  describe.skip("Store category visibility (requires disposable-local opt-in)", () => {
    it("requires exclusive disposable PostgreSQL and TLS Redis", () => {});
  });
} else {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  ) {
    throw new Error(
      "Store category tests require disposable localhost PostgreSQL.",
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
      "Store category tests require exclusive localhost TLS Redis DB15.",
    );
  }
  const dbName = `store_categories_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL =
    `postgres://closure_test:${encodeURIComponent(process.env.DB_PASSWORD)}` +
    `@localhost:55432/${dbName}`;
  jest.setTimeout(180_000);

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
            "Refusing category tests against another database or Redis.",
          );
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      let publishableKey: string;
      let namespace: string;

      const request = (
        url: string,
        params: object = {},
        headers: Record<string, string> = {},
      ) =>
        api.get(url, {
          params,
          headers: { "x-publishable-api-key": publishableKey, ...headers },
          validateStatus: () => true,
        });

      const storeCategories = (params: object = {}) =>
        request("/store/product-categories", {
          q: namespace,
          fields: "id,name",
          limit: 100,
          ...params,
        });

      async function categories(
        input: Array<{
          name: string;
          is_active?: boolean;
          is_internal?: boolean;
        }>,
      ) {
        const { result } = await createProductCategoriesWorkflow(
          getContainer(),
        ).run({
          input: {
            product_categories: input.map((category) => ({
              is_active: true,
              is_internal: false,
              ...category,
              name: `${namespace} ${category.name}`,
            })),
          },
        });
        return result;
      }

      async function product(categoryId: string, status: ProductStatus) {
        const { result } = await createProductsWorkflow(getContainer()).run({
          input: {
            products: [
              {
                title: `${namespace} product ${randomUUID()}`,
                status,
                category_ids: [categoryId],
                options: [{ title: "Presentation", values: ["One"] }],
                variants: [
                  {
                    title: "One",
                    options: { Presentation: "One" },
                    manage_inventory: false,
                    prices: [],
                  },
                ],
              },
            ],
          },
        });
        return result[0];
      }

      async function identity() {
        const auth = getContainer().resolve<IAuthModuleService>(Modules.AUTH);
        const email = `category-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registration = await auth.register("emailpass", {
          body: { email, password },
        });
        if (!registration.success || !registration.authIdentity) {
          throw new Error("Native category identity registration failed.");
        }
        const id = registration.authIdentity.id;
        const verification = await auth.requestAuthVerification({
          auth_identity_id: id,
          entity_id: email,
          entity_type: "email",
          code_provider: "token",
        });
        if (!verification.code)
          throw new Error("Category verification code missing.");
        await auth.confirmAuthVerification({
          code: verification.code,
          auth_identity_id: id,
        });
        return { id, email, password };
      }

      async function login(
        actor: "user" | "member",
        account: Awaited<ReturnType<typeof identity>>,
      ) {
        const response = await api.post(`/auth/${actor}/emailpass`, {
          email: account.email,
          password: account.password,
        });
        expect(response.status).toBe(200);
        return response.data.token as string;
      }

      beforeEach(async () => {
        namespace = `CATVIS${randomUUID().replaceAll("-", "")}`;
        const { result: keys } = await createApiKeysWorkflow(
          getContainer(),
        ).run({
          input: {
            api_keys: [
              {
                title: namespace,
                type: "publishable",
                created_by: "integration-test",
              },
            ],
          },
        });
        publishableKey = keys[0].token;
        const { result: channels } = await createSalesChannelsWorkflow(
          getContainer(),
        ).run({
          input: { salesChannelsData: [{ name: namespace }] },
        });
        await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({
          input: { id: keys[0].id, add: [channels[0].id] },
        });
      });

      it("returns only active public categories with published non-deleted products and reacts to withdrawal", async () => {
        const [
          visible,
          empty,
          draft,
          rejected,
          proposed,
          deletedProduct,
          inactive,
          internal,
          deletedCategory,
        ] = await categories([
          { name: "Published" },
          { name: "Empty" },
          { name: "Draft" },
          { name: "Rejected" },
          { name: "Proposed" },
          { name: "Deleted product" },
          { name: "Inactive", is_active: false },
          { name: "Internal", is_internal: true },
          { name: "Deleted category" },
        ]);
        const published = await product(visible.id, ProductStatus.PUBLISHED);
        await product(draft.id, ProductStatus.DRAFT);
        await product(rejected.id, ProductStatus.REJECTED);
        await product(proposed.id, ProductStatus.PROPOSED);
        const removed = await product(
          deletedProduct.id,
          ProductStatus.PUBLISHED,
        );
        await product(inactive.id, ProductStatus.PUBLISHED);
        await product(internal.id, ProductStatus.PUBLISHED);
        await product(deletedCategory.id, ProductStatus.PUBLISHED);
        await deleteProductsWorkflow(getContainer()).run({
          input: { ids: [removed.id] },
        });
        await deleteProductCategoriesWorkflow(getContainer()).run({
          input: [deletedCategory.id],
        });

        const startedAt = performance.now();
        const response = await storeCategories();
        console.info(
          `Store category visibility HTTP: ${Math.round(performance.now() - startedAt)} ms`,
        );
        expect(response.status).toBe(200);
        expect(response.data.product_categories).toEqual([
          { id: visible.id, name: visible.name },
        ]);
        expect(response.data.count).toBe(1);
        expect(
          response.data.product_categories.some(
            (category: { id: string }) => category.id === empty.id,
          ),
        ).toBe(false);

        await updateProductsWorkflow(getContainer()).run({
          input: {
            selector: { id: published.id },
            update: { status: ProductStatus.DRAFT },
          },
        });
        const withdrawn = await storeCategories();
        expect(withdrawn.status).toBe(200);
        expect(withdrawn.data.product_categories).toEqual([]);
        expect(withdrawn.data.count).toBe(0);
      });

      it("filters before limit, offset and count while preserving q, id and existing logical filters", async () => {
        const all = await categories([
          ...Array.from({ length: 7 }, (_, index) => ({
            name: `00 Empty ${index}`,
          })),
          { name: "10 Visible Alpha" },
          { name: "20 Visible Beta" },
          { name: "30 Visible Gamma" },
        ]);
        const visible = all.slice(7);
        await product(visible[0].id, ProductStatus.PUBLISHED);
        await product(visible[0].id, ProductStatus.PUBLISHED);
        await product(visible[0].id, ProductStatus.DRAFT);
        await product(visible[1].id, ProductStatus.PUBLISHED);
        await product(visible[2].id, ProductStatus.PUBLISHED);

        const first = await storeCategories({
          order: "name",
          limit: 2,
          offset: 0,
        });
        expect(first.status).toBe(200);
        expect(first.data).toMatchObject({ count: 3, limit: 2, offset: 0 });
        expect(
          first.data.product_categories.map(
            (category: { id: string }) => category.id,
          ),
        ).toEqual(visible.slice(0, 2).map((category) => category.id));
        const last = await storeCategories({
          order: "name",
          limit: 2,
          offset: 2,
        });
        expect(last.status).toBe(200);
        expect(last.data).toMatchObject({ count: 3, limit: 2, offset: 2 });
        expect(last.data.product_categories).toEqual([
          { id: visible[2].id, name: visible[2].name },
        ]);

        const named = await storeCategories({
          q: `${namespace} 20 Visible Beta`,
        });
        expect(named.status).toBe(200);
        expect(named.data.product_categories).toEqual([
          { id: visible[1].id, name: visible[1].name },
        ]);
        expect(named.data.count).toBe(1);
        const selected = await storeCategories({
          id: [all[0].id, visible[2].id],
        });
        expect(selected.status).toBe(200);
        expect(selected.data.product_categories).toEqual([
          { id: visible[2].id, name: visible[2].name },
        ]);
        expect(selected.data.count).toBe(1);
        const logical = await storeCategories({
          $and: [{ id: visible[0].id }],
          $or: [{ id: all[0].id }, { id: visible[0].id }],
        });
        expect(logical.status).toBe(200);
        expect(logical.data.product_categories).toEqual([
          { id: visible[0].id, name: visible[0].name },
        ]);
        expect(logical.data.count).toBe(1);
      });

      it("keeps empty and draft-only categories available through authenticated Admin and Vendor endpoints", async () => {
        const [empty, draft] = await categories([
          { name: "Empty" },
          { name: "Draft" },
        ]);
        await product(draft.id, ProductStatus.DRAFT);
        const operator = await identity();
        const rbac = getContainer().resolve(Modules.RBAC);
        let policies = await rbac.listRbacPolicies({
          resource: "product_category",
          operation: PolicyOperation.read,
        });
        if (!policies.length) {
          ({ result: policies } = await createRbacPoliciesWorkflow(
            getContainer(),
          ).run({
            input: {
              policies: [
                {
                  key: `product_category:${PolicyOperation.read}`,
                  resource: "product_category",
                  operation: PolicyOperation.read,
                },
              ],
            },
          }));
        }
        const { result: roles } = await createRbacRolesWorkflow(
          getContainer(),
        ).run({
          input: {
            roles: [
              {
                name: namespace,
                policy_ids: policies.map((policy) => policy.id),
              },
            ],
          },
        });
        const { result: users } = await createUsersWorkflow(getContainer()).run(
          {
            input: { users: [{ email: operator.email, roles: [roles[0].id] }] },
          },
        );
        await getContainer()
          .resolve<IAuthModuleService>(Modules.AUTH)
          .updateAuthIdentities({
            id: operator.id,
            app_metadata: { user_id: users[0].id },
          });
        const admin = await request(
          "/admin/product-categories",
          {
            q: namespace,
            fields: "id,name",
            limit: 10,
            order: "name",
          },
          { authorization: `Bearer ${await login("user", operator)}` },
        );
        expect(admin.status).toBe(200);
        expect(admin.data.count).toBe(2);
        expect(
          new Set(
            admin.data.product_categories.map(
              (category: { id: string }) => category.id,
            ),
          ),
        ).toEqual(new Set([empty.id, draft.id]));

        const owner = await identity();
        const { result: seller } = await createSellerAccountWorkflow(
          getContainer(),
        ).run({
          input: {
            auth_identity_id: owner.id,
            member_email: owner.email,
            seller: {
              name: namespace,
              handle: `category-${randomUUID()}`,
              email: owner.email,
              currency_code: "usd",
            },
          },
        });
        await approveSellerWorkflow(getContainer()).run({
          input: { seller_id: seller.id },
        });
        const vendor = await request(
          "/vendor/product-categories",
          {
            q: namespace,
            fields: "id,name",
            limit: 10,
            order: "name",
          },
          {
            authorization: `Bearer ${await login("member", owner)}`,
            "x-seller-id": seller.id,
          },
        );
        expect(vendor.status).toBe(200);
        expect(vendor.data.count).toBe(2);
        expect(
          new Set(
            vendor.data.product_categories.map(
              (category: { id: string }) => category.id,
            ),
          ),
        ).toEqual(new Set([empty.id, draft.id]));
        expect((await storeCategories()).data.count).toBe(0);
      });
    },
  });
}
