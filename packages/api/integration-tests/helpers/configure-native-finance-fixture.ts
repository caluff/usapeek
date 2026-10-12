import { existsSync } from "node:fs";
import { open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { updateRegionsWorkflow } from "@medusajs/core-flows";
import {
  createOnboardingWorkflow,
  createPayoutAccountWorkflow,
} from "@mercurjs/core/workflows";
import type PayoutModule from "@mercurjs/core/modules/payout";
import {
  MercurModules,
  type PayoutAccountDTO,
  type PayoutProviderContext,
} from "@mercurjs/types";
import { getStripeConnectConfiguration } from "../../src/lib/stripe-connect-configuration";
import { refreshVendorStripeAccountWorkflow } from "../../src/workflows/refresh-vendor-stripe-account";
import { assertNativeFinanceRedis } from "./native-finance-redis-guard";

const manifestSchema = z.object({
  run_id: z.string().min(1),
  scenario: z.string().min(1),
  local_only: z.literal(true),
  region_id: z.string().min(1),
  currency_code: z.literal("usd"),
  vendors: z
    .array(
      z.object({
        seller_id: z.string().min(1),
        member_id: z.string().min(1),
        auth_identity_id: z.string().min(1),
      }),
    )
    .length(2),
});
const PROVIDER_ID = "pp_stripe_stripe";
const RETURN_URL = "http://127.0.0.1:3010/";
function requireFixture(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message);
}
function outside(directory: string, file: string) {
  const relative = path.relative(directory, file);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}
async function externalPath(value: string | undefined, workspace: string) {
  requireFixture(
    value && path.isAbsolute(value),
    "A private absolute fixture path is required.",
  );
  const parent = await realpath(path.dirname(value));
  const resolved = path.join(parent, path.basename(value));
  requireFixture(
    outside(workspace, resolved),
    "Fixture output must be outside the worktree.",
  );
  return resolved;
}

/**
 * Local-only QA setup for an existing native checkout fixture. No orders/payments.
 * Commands: inspect (default), setup, refresh. setup creates TEST Express accounts
 * and native onboarding links; it never marks an account active. Complete Stripe's
 * TEST onboarding separately, then refresh using the existing authorized workflow.
 * URLs are written only to a new private FINANCE_NATIVE_QA_OUTPUT_PATH, never logs.
 */
export default async function configureNativeFinanceFixture({
  container,
  args,
}: ExecArgs) {
  const [mode = "inspect"] = args;
  requireFixture(
    args.length <= 1 && ["inspect", "setup", "refresh"].includes(mode),
    "Use inspect, setup or refresh.",
  );
  const configuration = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  );
  assertNativeFinanceRedis(process.env, configuration);
  const database = new URL(
    configuration.projectConfig.databaseUrl ?? "invalid:",
  );
  const stripe = getStripeConnectConfiguration();
  requireFixture(
    process.env.FINANCE_NATIVE_QA === "disposable-local" &&
      process.env.NODE_ENV === "test" &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      !database.search &&
      !database.hash &&
      database.hostname === "localhost" &&
      database.port === "55432" &&
      /^\/closure_browser_[a-z0-9_]+$/.test(database.pathname) &&
      decodeURIComponent(database.username) === "closure_test" &&
      process.env.DB_USERNAME === "closure_test" &&
      process.env.DB_PORT === "55432" &&
      process.env.PGSSLMODE === "require" &&
      process.env.NODE_EXTRA_CA_CERTS &&
      existsSync(process.env.NODE_EXTRA_CA_CERTS) &&
      process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0" &&
      process.env.AUTH_EMAIL_ENABLED === "false" &&
      !process.env.DB_TEMP_NAME &&
      !process.env.MEDUSA_DB_SCHEMA &&
      stripe &&
      !stripe.jobsEnabled &&
      process.env.FINANCE_CHECKOUT_DATA_KIND === "qa_fixture" &&
      process.env.NATIVE_CHECKOUT_PRIVATE_OUTPUT === "verified",
    "Native finance QA requires the verified local TLS fixture and Stripe TEST configuration.",
  );
  const workspace = await realpath(path.resolve(__dirname, "../../../.."));
  const manifestPath = await externalPath(
    process.env.NATIVE_CHECKOUT_MANIFEST_PATH,
    workspace,
  );
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  requireFixture(
    new Set(manifest.vendors.map((vendor) => vendor.seller_id)).size === 2,
    "The fixture must have two distinct sellers.",
  );
  const matches = (metadata: Record<string, unknown> | null | undefined) =>
    metadata?.finance_data_kind === "qa_fixture" &&
    metadata.run_id === manifest.run_id &&
    metadata.scenario === manifest.scenario;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [regions, sellers, providers, links] = await Promise.all([
    query.graph(
      {
        entity: "region",
        fields: ["id", "metadata", "currency_code", "payment_providers.id"],
        filters: { id: manifest.region_id },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "seller",
        fields: ["id", "metadata"],
        filters: { id: manifest.vendors.map((vendor) => vendor.seller_id) },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "payment_provider",
        fields: ["id", "is_enabled"],
        filters: { id: PROVIDER_ID },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "seller_payout_account",
        fields: ["seller_id", "payout_account_id"],
        filters: {
          seller_id: manifest.vendors.map((vendor) => vendor.seller_id),
        },
      },
      { cache: { enable: false } },
    ),
  ]);
  const region = regions.data[0];
  requireFixture(
    regions.data.length === 1 &&
      region.currency_code === "usd" &&
      matches(region.metadata),
    "Region does not belong to this fixture.",
  );
  requireFixture(
    sellers.data.length === 2 &&
      sellers.data.every((seller) => matches(seller.metadata)),
    "Sellers do not belong to this fixture.",
  );
  requireFixture(
    providers.data.length === 1 && providers.data[0].is_enabled,
    "The native Stripe payment provider is not enabled.",
  );
  const payout = container.resolve<InstanceType<typeof PayoutModule.service>>(
    MercurModules.PAYOUT,
  );
  const accounts = await payout.listPayoutAccounts({}, { take: 100 });
  requireFixture(
    accounts.length < 100,
    "Fixture account inspection exceeded its explicit limit.",
  );
  const ownAccounts = manifest.vendors.map((vendor) => {
    const matchingLinks = links.data.filter(
      (link) => link.seller_id === vendor.seller_id,
    );
    const candidates = accounts.filter(
      (account) =>
        account.context?.qa_run_id === manifest.run_id &&
        account.context?.qa_seller_id === vendor.seller_id,
    );
    requireFixture(
      matchingLinks.length <= 1 && candidates.length <= 1,
      "Fixture payout identity is ambiguous.",
    );
    const account = candidates[0];
    requireFixture(
      (!account && matchingLinks.length === 0) ||
        (account &&
          matchingLinks[0]?.payout_account_id === account.id &&
          account.context?.qa_scenario === manifest.scenario),
      "An existing or partially linked account requires inspection before setup can continue.",
    );
    return { vendor, account };
  });
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  if (mode === "inspect") {
    logger.info(
      JSON.stringify({
        run_id: manifest.run_id,
        mode,
        region_id: region.id,
        payment_provider: PROVIDER_ID,
        accounts: ownAccounts.map(({ vendor, account }) => ({
          seller_id: vendor.seller_id,
          payout_account_id: account?.id ?? null,
          status: account?.status ?? "not_created",
        })),
      }),
    );
    return;
  }
  if (mode === "refresh") {
    for (const { vendor, account } of ownAccounts) {
      requireFixture(account, "Complete native account setup before refresh.");
      const { result } = await refreshVendorStripeAccountWorkflow(
        container,
      ).run({ input: vendor });
      logger.info(
        JSON.stringify({
          run_id: manifest.run_id,
          seller_id: vendor.seller_id,
          ...result,
        }),
      );
    }
    return;
  }
  const outputPath = await externalPath(
    process.env.FINANCE_NATIVE_QA_OUTPUT_PATH,
    workspace,
  );
  requireFixture(
    outputPath.toLowerCase() !== manifestPath.toLowerCase(),
    "Private output must not replace the manifest.",
  );
  const output = await open(outputPath, "wx", 0o600);
  const progress: {
    run_id: string;
    mode: string;
    phase: string;
    accounts: Record<string, unknown>[];
  } = {
    run_id: manifest.run_id,
    mode: "test",
    phase: "reserved",
    accounts: [],
  };
  const persist = async () => {
    await output.truncate(0);
    await output.write(`${JSON.stringify(progress, null, 2)}\n`, 0, "utf8");
    await output.sync();
  };
  try {
    await persist();
    const existing =
      region.payment_providers?.flatMap((provider) =>
        provider?.id ? [provider.id] : [],
      ) ?? [];
    if (!existing.includes(PROVIDER_ID))
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: { payment_providers: [...existing, PROVIDER_ID] },
        },
      });
    for (const entry of ownAccounts) {
      progress.phase = `native-account:${entry.vendor.seller_id}`;
      await persist();
      let account: PayoutAccountDTO | undefined = entry.account;
      if (!account) {
        // The native service persists context as model.json; its provider DTO
        // documents only idempotency_key. These tags stay in local persistence.
        const context: PayoutProviderContext & Record<string, string> = {
          qa_run_id: manifest.run_id,
          qa_scenario: manifest.scenario,
          qa_seller_id: entry.vendor.seller_id,
        };
        const { result } = await createPayoutAccountWorkflow(container).run({
          input: {
            seller_id: entry.vendor.seller_id,
            data: { country: "US" },
            context,
          },
        });
        account = result;
      }
      requireFixture(
        typeof account.data?.id === "string" &&
          account.data.id.startsWith("acct_") &&
          typeof account.data.metadata === "object" &&
          account.data.metadata !== null &&
          (account.data.metadata as Record<string, unknown>).account_id ===
            account.id,
        "Native Stripe account binding was not confirmed.",
      );
      const row: Record<string, unknown> = {
        seller_id: entry.vendor.seller_id,
        payout_account_id: account.id,
        stripe_account_id: account.data.id,
        status: account.status,
      };
      progress.accounts.push(row);
      await persist();
      progress.phase = `native-onboarding:${entry.vendor.seller_id}`;
      await persist();
      const { result: onboarding } = await createOnboardingWorkflow(
        container,
      ).run({
        input: {
          account_id: account.id,
          data: { refresh_url: RETURN_URL, return_url: RETURN_URL },
        },
      });
      const url = z.url().parse(onboarding.data?.url);
      requireFixture(
        new URL(url).protocol === "https:" &&
          new URL(url).hostname === "connect.stripe.com",
        "Unexpected onboarding URL.",
      );
      row.onboarding_url = url;
      await persist();
    }
    progress.phase = "awaiting-stripe-test-onboarding";
    await persist();
    logger.info(
      JSON.stringify({
        run_id: manifest.run_id,
        mode,
        accounts: progress.accounts.length,
        private_output: outputPath,
      }),
    );
  } catch {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Native finance QA stopped at ${progress.phase}. Inspect the private checkpoint and fixture before retrying; no provider payload was logged.`,
    );
  } finally {
    await output.close();
  }
}
