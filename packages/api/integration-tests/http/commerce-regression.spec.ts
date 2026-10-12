/**
 * COMMERCE_REGRESSION_TESTS=disposable-local opts into a random local database
 * owned by Medusa's runner. Use dedicated TLS PostgreSQL/Redis; never shared
 * infrastructure. No payment sessions, external providers, or mocked inventory.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@medusajs/framework/pg";
import type { HttpTypes } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  addToCartWorkflow,
  createInventoryItemsWorkflow,
  createPaymentCollectionForCartWorkflow,
  createStockLocationsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/core-flows";
import type InventoryModuleService from "../../src/modules/inventory/service";
import { setProductSaleStatusWorkflow } from "../../src/workflows/set-product-sale-status";
import { updateVendorOfferPriceWorkflow } from "../../src/workflows/update-vendor-offer-price";
import { prepareNativeCheckoutFixture } from "../helpers/native-checkout-fixture";

if (process.env.COMMERCE_REGRESSION_TESTS !== "disposable-local") {
  describe.skip("commerce regression (requires disposable-local opt-in)", () => {
    it("requires isolated PostgreSQL and Redis", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" || process.env.DB_USERNAME !== "closure_test" || !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" || !process.env.NODE_EXTRA_CA_CERTS ||
    !existsSync(process.env.NODE_EXTRA_CA_CERTS) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error("Use dedicated localhost PostgreSQL with TLS; this suite owns its database names.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || redis.port !== "56379" ||
    redis.username !== "closure" || !redis.password || redis.pathname !== "/15") {
    throw new Error("Use dedicated localhost TLS Redis on port 56379, DB 15.");
  }
  if ((process.env.JWT_SECRET?.trim().length ?? 0) < 32 ||
    (process.env.COOKIE_SECRET?.trim().length ?? 0) < 32 || process.env.JWT_SECRET === process.env.COOKIE_SECRET) {
    throw new Error("Import distinct ephemeral JWT and cookie secrets before running this suite.");
  }
  for (const name of [
    "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PAYOUT_WEBHOOK_SECRET",
    "ALGOLIA_APP_ID", "ALGOLIA_API_KEY", "ALGOLIA_PRODUCT_INDEX",
    "SUPABASE_S3_ENDPOINT", "SUPABASE_S3_REGION", "SUPABASE_S3_ACCESS_KEY_ID",
    "SUPABASE_S3_SECRET_ACCESS_KEY", "SUPABASE_STORAGE_BUCKET",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL",
    "RESEND_API_KEY", "RESEND_FROM_EMAIL", "AUTH_EMAIL_FROM",
  ]) {
    if (process.env[name]?.trim()) throw new Error("External providers must be disabled for commerce regression.");
    process.env[name] = " ";
  }
  const dbName = `closure_commerce_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async container => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        const database = new URL(config.projectConfig.databaseUrl!);
        if (database.hostname !== "localhost" || database.port !== process.env.DB_PORT || database.pathname !== `/${dbName}` ||
          config.projectConfig.redisUrl !== process.env.REDIS_URL) {
          throw new Error("Application database differs from this disposable runner's database.");
        }
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) =>
            typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Use only local/mock notifications in disposable commerce regression.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      const inventory = () => getContainer().resolve<InventoryModuleService>(Modules.INVENTORY);
      const connection = () => new Client({
        host: "localhost", port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD, database: dbName, statement_timeout: 15_000,
      });

      async function inventoryFixture(quantity: number) {
        const { result: locations } = await createStockLocationsWorkflow(getContainer()).run({
          input: { locations: [{ name: `Commerce race ${randomUUID()}` }] },
        });
        const { result: items } = await createInventoryItemsWorkflow(getContainer()).run({ input: {
          items: [{ title: "Disposable race inventory", location_levels: [{ location_id: locations[0].id, stocked_quantity: quantity }] }],
        } });
        const [level] = await inventory().listInventoryLevels({ inventory_item_id: items[0].id });
        return { inventory_item_id: items[0].id, location_id: locations[0].id, levelId: level.id };
      }

      async function persistedInventory(itemId: string) {
        const client = connection();
        await client.connect();
        try {
          const levels = await client.query<{ stocked: number; reserved: number }>(
            "SELECT stocked_quantity::float8 AS stocked, reserved_quantity::float8 AS reserved FROM inventory_level WHERE inventory_item_id = $1 AND deleted_at IS NULL", [itemId],
          );
          const reservations = await client.query<{ id: string; quantity: number }>(
            "SELECT id, quantity::float8 AS quantity FROM reservation_item WHERE inventory_item_id = $1 AND deleted_at IS NULL ORDER BY id", [itemId],
          );
          expect(levels.rows).toHaveLength(1);
          expect(levels.rows[0].reserved).toBe(reservations.rows.reduce((total, item) => total + item.quantity, 0));
          return { ...levels.rows[0], reservations: reservations.rows };
        } finally { await client.end(); }
      }

      async function persistedCartLines(cartId: string) {
        const client = connection();
        await client.connect();
        try {
          return (await client.query<{ unit_price: number; quantity: number; is_custom_price: boolean }>(
            "SELECT unit_price::float8 AS unit_price, quantity::float8 AS quantity, is_custom_price FROM cart_line_item WHERE cart_id = $1 AND deleted_at IS NULL ORDER BY id", [cartId],
          )).rows;
        } finally { await client.end(); }
      }

      async function race(levelId: string, operations: [() => Promise<unknown>, () => Promise<unknown>]) {
        const blocker = connection();
        const observer = connection();
        await blocker.connect();
        await observer.connect();
        let outcomes: Promise<PromiseSettledResult<unknown>[]> | undefined;
        let barrierError: unknown;
        try {
          await blocker.query("BEGIN");
          await blocker.query("SELECT id FROM inventory_level WHERE id = $1 FOR UPDATE", [levelId]);
          outcomes = Promise.allSettled(operations.map(operation => operation()));
          // Prove both real transactions overlap at PostgreSQL's lock boundary.
          // No fixed startup sleep and no mocked repository/transaction manager.
          const deadline = Date.now() + 10_000;
          let waiting = 0;
          while (waiting < 2 && Date.now() < deadline) {
            const result = await observer.query<{ count: number }>(
              "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%inventory_level%' AND pid <> pg_backend_pid()",
            );
            waiting = result.rows[0].count;
            if (waiting < 2) await delay(20);
          }
          expect(waiting).toBe(2);
        } catch (error) { barrierError = error; }
        finally {
          await blocker.query("ROLLBACK");
          await blocker.end();
          await observer.end();
        }
        const results = await outcomes!;
        if (barrierError) throw barrierError;
        return results;
      }

      async function commerceFixture(stock = 5) {
        const manifest = await prepareNativeCheckoutFixture(getContainer(), {
          runId: randomUUID(), scenario: "commerce-regression", inventoryQuantity: stock,
        });
        const product = manifest.products[0];
        const headers = { "x-publishable-api-key": manifest.publishable_key };
        const request = (method: "GET" | "POST" | "DELETE", path: string, data?: object) => api.request({ method, url: path, data, headers, validateStatus: () => true });
        const cart = async () => {
          const response = await request("POST", "/store/carts", { region_id: manifest.region_id, sales_channel_id: manifest.sales_channel_id });
          expect(response.status).toBe(200);
          return (response.data as HttpTypes.StoreCartResponse).cart;
        };
        return {
          request, cart, manifest, productId: product.id, inventoryId: product.inventory_item_id, locationId: product.location_id,
          offer: { id: product.offer_id, seller_id: product.seller_id, sku: product.sku, shipping_profile_id: product.shipping_profile_id },
        };
      }

      it("allows exactly one real reservation of the last unit under overlapping transactions", async () => {
        const fixture = await inventoryFixture(1);
        const reserve = () => inventory().createReservationItems({ inventory_item_id: fixture.inventory_item_id, location_id: fixture.location_id, quantity: 1 });
        const results = await race(fixture.levelId, [reserve, reserve]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { type: "not_allowed" } });
        const state = await persistedInventory(fixture.inventory_item_id);
        expect(state).toMatchObject({ stocked: 1, reserved: 1 });
        expect(state.reservations).toHaveLength(1);
        expect(state.reservations[0].quantity).toBe(1);
      });

      it("accepts only one absolute count with the same expected stock", async () => {
        const fixture = await inventoryFixture(10);
        const results = await race(fixture.levelId, [
          () => inventory().compareAndSetInventory({ ...fixture, expected_quantity: 10, stocked_quantity: 12 }),
          () => inventory().compareAndSetInventory({ ...fixture, expected_quantity: 10, stocked_quantity: 14 }),
        ]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { type: "conflict" } });
        const winner = results[0].status === "fulfilled" ? 12 : 14;
        expect(await persistedInventory(fixture.inventory_item_id)).toEqual({ stocked: winner, reserved: 0, reservations: [] });
      });

      it("serializes a vendor count decrease against a native reservation without overselling", async () => {
        const fixture = await inventoryFixture(10);
        const results = await race(fixture.levelId, [
          () => inventory().compareAndSetInventory({ ...fixture, expected_quantity: 10, stocked_quantity: 5 }),
          () => inventory().createReservationItems({ inventory_item_id: fixture.inventory_item_id, location_id: fixture.location_id, quantity: 8 }),
        ]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        const state = await persistedInventory(fixture.inventory_item_id);
        if (results[0].status === "fulfilled") {
          expect(results[1]).toMatchObject({ status: "rejected", reason: { type: "not_allowed" } });
          expect(state).toEqual({ stocked: 5, reserved: 0, reservations: [] });
        } else {
          expect(results[0]).toMatchObject({ reason: { type: "conflict" } });
          expect(state).toMatchObject({ stocked: 10, reserved: 8, reservations: [{ quantity: 8 }] });
        }
      });

      it("preserves a native stock delta when an absolute count races it", async () => {
        const fixture = await inventoryFixture(10);
        const results = await race(fixture.levelId, [
          () => inventory().compareAndSetInventory({ ...fixture, expected_quantity: 10, stocked_quantity: 12 }),
          () => inventory().adjustInventory(fixture.inventory_item_id, fixture.location_id, -1, {}),
        ]);
        expect(results[1].status).toBe("fulfilled");
        if (results[0].status === "rejected") expect(results[0]).toMatchObject({ reason: { type: "conflict" } });
        expect(await persistedInventory(fixture.inventory_item_id)).toEqual({ stocked: results[0].status === "fulfilled" ? 11 : 9, reserved: 0, reservations: [] });
      });

      it("updates and releases persisted reservations without changing physical stock", async () => {
        const fixture = await inventoryFixture(5);
        const reservation = await inventory().createReservationItems({ inventory_item_id: fixture.inventory_item_id, location_id: fixture.location_id, quantity: 3 });
        await inventory().updateReservationItems({ id: reservation.id, quantity: 2 });
        expect(await persistedInventory(fixture.inventory_item_id)).toEqual({ stocked: 5, reserved: 2, reservations: [{ id: reservation.id, quantity: 2 }] });
        await expect(inventory().compareAndSetInventory({ ...fixture, expected_quantity: 5, stocked_quantity: 1 })).rejects.toMatchObject({ type: "conflict" });
        await inventory().deleteReservationItems(reservation.id);
        expect(await persistedInventory(fixture.inventory_item_id)).toEqual({ stocked: 5, reserved: 0, reservations: [] });
        await inventory().compareAndSetInventory({ ...fixture, expected_quantity: 5, stocked_quantity: 1 });
        expect(await persistedInventory(fixture.inventory_item_id)).toEqual({ stocked: 1, reserved: 0, reservations: [] });
      });

      it("rechecks real offer availability on HTTP add/update and permits removal after stock disappears", async () => {
        const fixture = await commerceFixture(2);
        const cart = await fixture.cart();
        const path = `/store/carts/${cart.id}/line-items`;
        const added = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 2 });
        expect(added.status).toBe(200);
        const line = (added.data as HttpTypes.StoreCartResponse).cart.items![0];
        expect(line).toMatchObject({ quantity: 2, unit_price: 19.99 });
        expect(await persistedInventory(fixture.inventoryId)).toEqual({ stocked: 2, reserved: 0, reservations: [] });
        const excess = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 1 });
        expect(excess.status).toBe(400);
        expect(excess.data.code).toBe("insufficient_inventory");
        const reservation = await inventory().createReservationItems({ inventory_item_id: fixture.inventoryId, location_id: fixture.locationId, quantity: 2 });
        const update = await fixture.request("POST", `${path}/${line.id}`, { quantity: 3 });
        expect(update.status).toBe(400);
        expect(update.data.code).toBe("insufficient_inventory");
        const after = await fixture.request("GET", `/store/carts/${cart.id}`);
        expect(after.status).toBe(200);
        expect((after.data as HttpTypes.StoreCartResponse).cart.items).toEqual([expect.objectContaining({ id: line.id, quantity: 2, unit_price: 19.99 })]);
        const removed = await fixture.request("DELETE", `${path}/${line.id}`);
        expect(removed.status).toBe(200);
        expect((await fixture.request("GET", `/store/carts/${cart.id}`)).data.cart.items).toEqual([]);
        // Removing an unreserved cart line must not release another purchase's reservation.
        expect(await persistedInventory(fixture.inventoryId)).toEqual({ stocked: 2, reserved: 2, reservations: [{ id: reservation.id, quantity: 2 }] });
      });

      it("serializes concurrent HTTP additions against the resulting quantity of the same cart", async () => {
        const fixture = await commerceFixture(1);
        const cart = await fixture.cart();
        const add = () => fixture.request("POST", `/store/carts/${cart.id}/line-items`, { offer_id: fixture.offer.id, quantity: 1 });
        const results = await Promise.all([add(), add()]);
        expect(results.map(result => result.status).sort()).toEqual([200, 400]);
        expect(results.find(result => result.status === 400)!.data.code).toBe("insufficient_inventory");
        const after = await fixture.request("GET", `/store/carts/${cart.id}`);
        expect(after.data.cart.items).toEqual([expect.objectContaining({ quantity: 1, unit_price: 19.99 })]);
        expect(await persistedInventory(fixture.inventoryId)).toEqual({ stocked: 1, reserved: 0, reservations: [] });
      });

      it("rejects a buyer-supplied custom price instead of persisting a cheaper offer", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        const listed = await fixture.request("GET", `/store/offers?id=${fixture.offer.id}`);
        expect(listed.status).toBe(200);
        expect(listed.data.offers).toEqual([expect.objectContaining({ id: fixture.offer.id, prices: [expect.objectContaining({ amount: 19.99, currency_code: "usd" })] })]);
        const response = await fixture.request("POST", `/store/carts/${cart.id}/line-items`, {
          offer_id: fixture.offer.id, quantity: 1, unit_price: 0.01,
        });
        const read = await fixture.request("GET", `/store/carts/${cart.id}`);
        expect(read.status).toBe(200);
        const persisted = await persistedCartLines(cart.id);
        const listedAfter = await fixture.request("GET", `/store/offers?id=${fixture.offer.id}`);
        expect(listedAfter.status).toBe(200);
        expect(listedAfter.data.offers[0].prices[0].amount).toBe(19.99);
        expect({ status: response.status, persisted, total: read.data.cart.total, items: read.data.cart.items.length }).toEqual({ status: 400, persisted: [], total: 0, items: 0 });
      });

      it("keeps the read-only cart price until quantity update resolves the current offer price", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        const path = `/store/carts/${cart.id}/line-items`;
        const added = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 1 });
        expect(added.status).toBe(200);
        const line = (added.data as HttpTypes.StoreCartResponse).cart.items![0];
        expect(line.unit_price).toBe(19.99);
        expect(await persistedCartLines(cart.id)).toEqual([{ unit_price: 19.99, quantity: 1, is_custom_price: false }]);
        await updateVendorOfferPriceWorkflow(getContainer()).run({ input: {
          seller_id: fixture.offer.seller_id, offer_id: fixture.offer.id, expected_amount: 19.99, amount: 24.99,
          sku: fixture.offer.sku, expected_sku: fixture.offer.sku,
          shipping_profile_id: fixture.offer.shipping_profile_id, expected_shipping_profile_id: fixture.offer.shipping_profile_id,
        } });
        const read = await fixture.request("GET", `/store/carts/${cart.id}`);
        expect(read.status).toBe(200);
        expect(read.data.cart.items[0].unit_price).toBe(19.99);
        const changed = await fixture.request("POST", `${path}/${line.id}`, { quantity: 2 });
        expect(changed.status).toBe(200);
        expect(changed.data.cart.items).toEqual([expect.objectContaining({ id: line.id, quantity: 2, unit_price: 24.99 })]);
        expect(changed.data.cart.total).toBe(49.98);
        expect(await persistedCartLines(cart.id)).toEqual([{ unit_price: 24.99, quantity: 2, is_custom_price: false }]);
        expect(await persistedInventory(fixture.inventoryId)).toEqual({ stocked: 5, reserved: 0, reservations: [] });
      });

      it("rejects a custom price in initial cart items before creating a cart", async () => {
        const fixture = await commerceFixture();
        const created = await fixture.request("POST", "/store/carts", {
          region_id: fixture.manifest.region_id, sales_channel_id: fixture.manifest.sales_channel_id,
          items: [{ variant_id: fixture.manifest.products[0].variant_id, quantity: 1, unit_price: 0.01 }],
        });
        const client = connection();
        await client.connect();
        try {
          const { rows } = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM cart WHERE deleted_at IS NULL");
          expect({ status: created.status, carts: rows[0].count }).toEqual({ status: 400, carts: 0 });
        } finally { await client.end(); }
      });

      it("rejects a custom price on update without changing the existing line", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        const path = `/store/carts/${cart.id}/line-items`;
        const added = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 1 });
        expect(added.status).toBe(200);
        const line = (added.data as HttpTypes.StoreCartResponse).cart.items![0];
        const changed = await fixture.request("POST", `${path}/${line.id}`, { quantity: 2, unit_price: 0.01 });
        expect({ status: changed.status, lines: await persistedCartLines(cart.id) }).toEqual({
          status: 400, lines: [{ unit_price: 19.99, quantity: 1, is_custom_price: false }],
        });
      });

      it("blocks new lines for a globally unpublished product while keeping removal available", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        const path = `/store/carts/${cart.id}/line-items`;
        const added = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 1 });
        expect(added.status).toBe(200);
        const line = (added.data as HttpTypes.StoreCartResponse).cart.items![0];
        await updateProductsWorkflow(getContainer()).run({ input: { products: [{ id: fixture.productId, status: ProductStatus.DRAFT }] } });
        const rejected = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 1 });
        expect(rejected.status).toBe(400);
        expect(rejected.data.message).toMatch(/not published/);
        const after = await fixture.request("GET", `/store/carts/${cart.id}`);
        expect(after.data.cart.items).toEqual([expect.objectContaining({ id: line.id, quantity: 1 })]);
        expect((await fixture.request("DELETE", `${path}/${line.id}`)).status).toBe(200);
        expect((await fixture.request("GET", `/store/carts/${cart.id}`)).data.cart.items).toEqual([]);
      });

      it("blocks quantity increases but allows decreases for a globally unpublished product already in a cart", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        const path = `/store/carts/${cart.id}/line-items`;
        const added = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 2 });
        expect(added.status).toBe(200);
        const line = (added.data as HttpTypes.StoreCartResponse).cart.items![0];
        await updateProductsWorkflow(getContainer()).run({ input: { products: [{ id: fixture.productId, status: ProductStatus.DRAFT }] } });
        const changed = await fixture.request("POST", `${path}/${line.id}`, { quantity: 3 });
        const persisted = await persistedCartLines(cart.id);
        const after = await fixture.request("GET", `/store/carts/${cart.id}`);
        expect(after.status).toBe(200);
        expect({ status: changed.status, persisted, items: after.data.cart.items.map((item: HttpTypes.StoreCartLineItem) => ({ id: item.id, quantity: item.quantity })) }).toEqual({
          status: 400, persisted: [{ unit_price: 19.99, quantity: 2, is_custom_price: false }], items: [{ id: line.id, quantity: 2 }],
        });
        const decreased = await fixture.request("POST", `${path}/${line.id}`, { quantity: 1 });
        expect(decreased.status).toBe(200);
        expect(await persistedCartLines(cart.id)).toEqual([{ unit_price: 19.99, quantity: 1, is_custom_price: false }]);
      });

      it("rejects unpublished products at payment-session and completion gates before provider effects", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        expect((await fixture.request("POST", `/store/carts/${cart.id}/line-items`, { offer_id: fixture.offer.id, quantity: 1 })).status).toBe(200);
        const collection = await fixture.request("POST", "/store/payment-collections", { cart_id: cart.id });
        expect(collection.status).toBe(200);
        await updateProductsWorkflow(getContainer()).run({ input: { products: [{ id: fixture.productId, status: ProductStatus.DRAFT }] } });
        const session = await fixture.request("POST", `/store/payment-collections/${collection.data.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" });
        const completed = await fixture.request("POST", `/store/carts/${cart.id}/complete`, {});
        for (const response of [session, completed]) {
          expect(response.status).toBe(400);
          expect(response.data.message).toMatch(/not published/);
        }
        const client = connection();
        await client.connect();
        try {
          const sessions = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM payment_session WHERE payment_collection_id = $1 AND deleted_at IS NULL", [collection.data.payment_collection.id]);
          const orders = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM order_cart WHERE cart_id = $1 AND deleted_at IS NULL", [cart.id]);
          expect({ sessions: sessions.rows[0].count, orders: orders.rows[0].count }).toEqual({ sessions: 0, orders: 0 });
        } finally { await client.end(); }
        expect(await persistedInventory(fixture.inventoryId)).toEqual({ stocked: 5, reserved: 0, reservations: [] });
      });

      it("blocks a previously custom-priced marketplace cart before payment or completion without rewriting its price", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        // Reproduce data accepted before the Store ingress fix through the native
        // internal workflow. Internal/admin custom-price creation remains supported.
        const item = {
          variant_id: fixture.manifest.products[0].variant_id, offer_id: fixture.offer.id,
          quantity: 1, unit_price: 0.01, requires_shipping: true, metadata: { offer_id: fixture.offer.id },
        };
        await addToCartWorkflow(getContainer()).run({ input: { cart_id: cart.id, items: [item] } });
        expect(await persistedCartLines(cart.id)).toEqual([{ unit_price: 0.01, quantity: 1, is_custom_price: true }]);
        const rejectedCollection = await fixture.request("POST", "/store/payment-collections", { cart_id: cart.id });
        const { result: collection } = await createPaymentCollectionForCartWorkflow(getContainer()).run({ input: { cart_id: cart.id } });
        const session = await fixture.request("POST", `/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: "pp_system_default" });
        const completed = await fixture.request("POST", `/store/carts/${cart.id}/complete`, {});
        for (const response of [rejectedCollection, session, completed]) {
          expect(response.status).toBe(400);
          expect(response.data.message).toMatch(/Remove the affected item and add it again/);
        }
        const client = connection();
        await client.connect();
        try {
          const sessions = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM payment_session WHERE payment_collection_id = $1 AND deleted_at IS NULL", [collection.id]);
          const orders = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM order_cart WHERE cart_id = $1 AND deleted_at IS NULL", [cart.id]);
          expect({ sessions: sessions.rows[0].count, orders: orders.rows[0].count }).toEqual({ sessions: 0, orders: 0 });
        } finally { await client.end(); }
        expect(await persistedCartLines(cart.id)).toEqual([{ unit_price: 0.01, quantity: 1, is_custom_price: true }]);
        expect(await persistedInventory(fixture.inventoryId)).toEqual({ stocked: 5, reserved: 0, reservations: [] });
      });

      it("applies seller pause independently of global publication and allows a quantity decrease", async () => {
        const fixture = await commerceFixture();
        const cart = await fixture.cart();
        const path = `/store/carts/${cart.id}/line-items`;
        const added = await fixture.request("POST", path, { offer_id: fixture.offer.id, quantity: 2 });
        expect(added.status).toBe(200);
        const line = (added.data as HttpTypes.StoreCartResponse).cart.items![0];
        await setProductSaleStatusWorkflow(getContainer()).run({ input: { seller_id: fixture.offer.seller_id, product_id: fixture.productId, paused: true } });
        for (const [url, body] of [[path, { offer_id: fixture.offer.id, quantity: 1 }], [`${path}/${line.id}`, { quantity: 3 }]] as const) {
          const response = await fixture.request("POST", url, body);
          expect(response.status).toBe(400);
          expect(response.data.message).toMatch(/pausado/);
        }
        const decreased = await fixture.request("POST", `${path}/${line.id}`, { quantity: 1 });
        expect(decreased.status).toBe(200);
        expect(decreased.data.cart.items[0].quantity).toBe(1);
        expect((await fixture.request("DELETE", `${path}/${line.id}`)).status).toBe(200);
        expect((await fixture.request("GET", `/store/carts/${cart.id}`)).data.cart.items).toEqual([]);
      });
    },
  });
}
