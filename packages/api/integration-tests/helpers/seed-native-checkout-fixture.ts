import { lstat, open, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductCategoriesWorkflow, updateProductsWorkflow } from "@medusajs/core-flows";
import { prepareNativeCheckoutFixture } from "./native-checkout-fixture";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const value = process.env[name] ?? String(fallback);
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return number;
}

function withinDirectory(directory: string, candidate: string) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

async function outputPath(name: string, worktree: string) {
  const requested = requiredEnvironment(name);
  if (!path.isAbsolute(requested) || withinDirectory(worktree, path.resolve(requested))) {
    throw new Error(`${name} must be an absolute path outside the worktree.`);
  }
  const parent = await realpath(path.dirname(requested));
  const resolved = path.join(parent, path.basename(requested));
  if (withinDirectory(worktree, resolved)) {
    throw new Error(`${name} must not resolve into the worktree through a symbolic link.`);
  }
  return resolved;
}

type ReservedOutput = { path: string; handle: FileHandle };

async function closeOutput(output: ReservedOutput) {
  const owned = await output.handle.stat();
  await output.handle.close();
  if (owned.size !== 0) return;
  const current = await lstat(output.path);
  if (current.isFile() && current.size === 0 && current.dev === owned.dev && current.ino === owned.ino) {
    await unlink(output.path);
  }
}

/**
 * Opt-in Medusa exec seed; creates no carts, orders, payments or transfers.
 * Requires NATIVE_CHECKOUT_FIXTURE=disposable-local, NATIVE_CHECKOUT_RUN_ID,
 * NATIVE_CHECKOUT_SCENARIO and a guarded local closure_browser_* database.
 * NATIVE_CHECKOUT_PRODUCT_COUNT defaults to 2 (maximum 31), and
 * NATIVE_CHECKOUT_INVENTORY_QUANTITY defaults to 5.
 *
 * NATIVE_CHECKOUT_MANIFEST_PATH and NATIVE_CHECKOUT_CREDENTIALS_PATH must be
 * distinct, unused absolute paths in existing directories outside the worktree.
 * Example directory: C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/browser-native-private
 * with separate manifest.json and credentials.json filenames for each run.
 * The launcher must verify private directory permissions before setting
 * NATIVE_CHECKOUT_PRIVATE_OUTPUT=verified. On Windows that means a protected ACL
 * limited to the current user and SYSTEM; mode 0600 alone does not establish it.
 * Call once per restored database; partial database mutations are not rolled back
 * by this wrapper. Failed runs remove only their own empty output placeholders.
 */
export default async function seedNativeCheckoutFixture({ container }: ExecArgs) {
  if (process.env.NATIVE_CHECKOUT_FIXTURE !== "disposable-local" ||
    process.env.NATIVE_CHECKOUT_PRIVATE_OUTPUT !== "verified") {
    throw new Error("Native checkout seed requires explicit disposable-local opt-in and verified private output directories.");
  }
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const database = new URL(config.projectConfig.databaseUrl ?? "invalid:");
  if (!/^\/closure_browser_[a-z0-9_]+$/.test(database.pathname)) {
    throw new Error("Native checkout exec requires a dedicated closure_browser_* database.");
  }
  const input = {
    runId: requiredEnvironment("NATIVE_CHECKOUT_RUN_ID"),
    scenario: requiredEnvironment("NATIVE_CHECKOUT_SCENARIO"),
    productCount: integerEnvironment("NATIVE_CHECKOUT_PRODUCT_COUNT", 2, 1, 31),
    inventoryQuantity: integerEnvironment("NATIVE_CHECKOUT_INVENTORY_QUANTITY", 5, 0, Number.MAX_SAFE_INTEGER),
  };
  const worktree = await realpath(path.resolve(__dirname, "../../../.."));
  const manifestPath = await outputPath("NATIVE_CHECKOUT_MANIFEST_PATH", worktree);
  const credentialsPath = await outputPath("NATIVE_CHECKOUT_CREDENTIALS_PATH", worktree);
  const comparisonPath = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  if (comparisonPath(manifestPath) === comparisonPath(credentialsPath)) {
    throw new Error("Native checkout manifest and credentials paths must be distinct.");
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const outputs: ReservedOutput[] = [];
  let phase = "exclusive output reservation";
  try {
    // Reserve both destinations before the first database mutation; never clobber.
    for (const destination of [manifestPath, credentialsPath]) {
      outputs.push({ path: destination, handle: await open(destination, "wx", 0o600) });
    }
    phase = "fixture creation";
    const fixture = await prepareNativeCheckoutFixture(container, input);
    phase = "catalog category creation";
    const { result: categories } = await createProductCategoriesWorkflow(container).run({ input: {
      product_categories: [{
        name: "QA checkout catalog", handle: `qa-checkout-${fixture.run_id}`,
        is_active: true, is_internal: false,
        metadata: { finance_data_kind: "qa_fixture", run_id: fixture.run_id, scenario: fixture.scenario },
      }],
    } });
    const category = categories[0];
    if (!category) throw new Error("Native fixture category was not created.");
    await updateProductsWorkflow(container).run({ input: {
      products: fixture.products.map(product => ({ id: product.id, category_ids: [category.id] })),
    } });
    const customers = fixture.customers.map(actor => ({ customer_id: actor.customer_id, auth_identity_id: actor.auth_identity_id }));
    const manifest = {
      run_id: fixture.run_id, scenario: fixture.scenario, local_only: fixture.local_only,
      region_id: fixture.region_id, currency_code: fixture.currency_code,
      sales_channel_id: fixture.sales_channel_id, publishable_key: fixture.publishable_key,
      publishable_key_id: fixture.publishable_key_id, commission_rate_id: fixture.commission_rate_id,
      customer: customers[0], customers,
      admin: { user_id: fixture.admin.user_id, role_id: fixture.admin.role_id, auth_identity_id: fixture.admin.auth_identity_id },
      vendors: fixture.vendors.map(actor => ({
        seller_id: actor.seller_id, member_id: actor.member_id, auth_identity_id: actor.auth_identity_id,
        location_id: actor.location_id, shipping_profile_id: actor.shipping_profile_id, shipping_option_id: actor.shipping_option_id,
      })),
      products: fixture.products, shipping_option_ids: fixture.shipping_option_ids,
      category: { id: category.id, handle: category.handle },
    };
    const credentials = {
      run_id: fixture.run_id, scenario: fixture.scenario, local_only: fixture.local_only,
      customer: fixture.customer, customers: fixture.customers, admin: fixture.admin,
      vendors: fixture.vendors.map(actor => ({
        seller_id: actor.seller_id, member_id: actor.member_id, auth_identity_id: actor.auth_identity_id,
        credentials: actor.credentials,
      })),
    };
    phase = "private credential output";
    await outputs[1].handle.writeFile(`${JSON.stringify(credentials, null, 2)}\n`, "utf8");
    await outputs[1].handle.sync();
    phase = "manifest output";
    await outputs[0].handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await outputs[0].handle.sync();
  } catch {
    // Medusa exec prints thrown errors; do not propagate provider payloads or secrets.
    throw new Error(`Native checkout fixture failed during ${phase}. Inspect the isolated database before retrying with new output paths.`);
  } finally {
    const cleanup = await Promise.allSettled(outputs.map(closeOutput));
    if (cleanup.some(result => result.status === "rejected")) {
      logger.warn("Native checkout output cleanup was incomplete; inspect the private output directory.");
    }
  }
  logger.info("Native checkout fixture saved to its manifest and separate private credentials file.");
}
