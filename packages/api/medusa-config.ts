import { existsSync } from "node:fs";
import path from "path";
import {
  FlagRouter,
  loadEnv,
  MedusaError,
  registerFeatureFlag,
} from "@medusajs/framework/utils";
import CachingFeatureFlag from "@medusajs/medusa/feature-flags/caching";
import { withMercur } from "@mercurjs/core";
import { getResendConfiguration } from "./src/modules/resend/configuration";
import { getStripeConnectConfiguration } from "./src/lib/stripe-connect-configuration";
import { getProductImageStorageConfiguration } from "./src/lib/file-storage-configuration";
import { getAlgoliaConfiguration } from "./src/modules/algolia/configuration";
import { getGoogleAuthConfiguration } from "./src/lib/google-auth-configuration";

const findWorkspaceRoot = (start: string): string | undefined => {
  let current = path.resolve(start);

  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
};

const repositoryRoot =
  findWorkspaceRoot(process.cwd()) ??
  findWorkspaceRoot(__dirname) ??
  process.cwd();

// Medusa's loader accepts a directory and chooses the environment-specific file.
// Walking to the workspace root works from source and from .medusa/server builds.
loadEnv(process.env.NODE_ENV || "development", repositoryRoot);

const requireUrl = (
  name: "DATABASE_URL" | "REDIS_URL",
  protocols: readonly string[],
): string => {
  const value = process.env[name];

  if (!value) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} is required`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must be a valid URL`,
    );
  }

  if (!protocols.includes(parsed.protocol) || !parsed.hostname) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must use ${protocols.join(" or ")} and include a host`,
    );
  }

  if (!parsed.username || !parsed.password) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must include credentials`,
    );
  }

  if (name === "DATABASE_URL" && parsed.pathname === "/") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must include a database name`,
    );
  }

  return value;
};

const requireSecret = (name: "JWT_SECRET" | "COOKIE_SECRET"): string => {
  const value = process.env[name];
  const normalized = value?.trim().toLowerCase() ?? "";
  const insecurePlaceholders = new Set([
    "secret",
    "supersecret",
    "change-me",
    "changeme",
  ]);

  if (!value?.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} is required`,
    );
  }

  if (value.trim().length < 32 || insecurePlaceholders.has(normalized)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must be a non-placeholder value of at least 32 characters`,
    );
  }

  return value;
};

const databaseUrl = requireUrl("DATABASE_URL", ["postgres:", "postgresql:"]);
const redisUrl = requireUrl("REDIS_URL", ["redis:", "rediss:"]);
const jwtSecret = requireSecret("JWT_SECRET");
const cookieSecret = requireSecret("COOKIE_SECRET");
const requestedWorkerMode = process.env.MEDUSA_WORKER_MODE || "shared";

if (
  !(["server", "worker", "shared"] as const).includes(
    requestedWorkerMode as "server" | "worker" | "shared",
  )
) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "[configuration] MEDUSA_WORKER_MODE must be server, worker, or shared",
  );
}

const workerMode = requestedWorkerMode as "server" | "worker" | "shared";
const resendConfiguration = getResendConfiguration();
const stripeConfiguration = getStripeConnectConfiguration();
const productImageStorageConfiguration = getProductImageStorageConfiguration();
const algoliaConfiguration = getAlgoliaConfiguration();
const googleAuthConfiguration = getGoogleAuthConfiguration();

if (jwtSecret === cookieSecret) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "[configuration] JWT_SECRET and COOKIE_SECRET must be different values",
  );
}

const featureFlags = {
  rbac: true,
  seller_registration: false,
};
const cachingFlagRouter = new FlagRouter({});
registerFeatureFlag({
  flag: CachingFeatureFlag,
  projectConfigFlags: featureFlags,
  router: cachingFlagRouter,
});

module.exports = withMercur({
  projectConfig: {
    databaseUrl,
    // Supabase's current certificate chain requires its downloaded CA for
    // strict verification. This still forces encrypted transport; see the
    // Railway guide for the manual verify-full hardening step.
    databaseDriverOptions: {
      connection: {
        ssl: { rejectUnauthorized: false },
      },
      pool: {
        min: 0,
        max: 4,
        idleTimeoutMillis: 30_000,
      },
    },
    redisUrl,
    workerMode,
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7000",
      vendorCors: process.env.VENDOR_CORS || "http://localhost:7001",
      authCors:
        process.env.AUTH_CORS ||
        "http://localhost:3000,http://localhost:7000,http://localhost:7001",
      jwtSecret,
      cookieSecret,
      ...(googleAuthConfiguration ? {
        authMethodsPerActor: {
          customer: ["emailpass", "google"],
          member: ["emailpass", "google"],
          user: ["emailpass", "google-admin"],
        },
      } : {}),
    },
  },
  admin: {
    disable: true,
  },
  featureFlags,
  modules: [
    // Medusa resolves its default modules before loading config.featureFlags.
    { resolve: "@medusajs/medusa/rbac" },
    { resolve: "./src/modules/spam-protection", options: { redisUrl, hashSecret: cookieSecret } },
    { resolve: "./src/modules/order-notifications", options: { redisUrl } },
    ...(googleAuthConfiguration
      ? [{
          resolve: "@medusajs/medusa/auth",
          dependencies: ["logger", "cache", "locking"],
          options: {
            mfa: { encryption_key: process.env.AUTH_MFA_ENCRYPTION_KEY },
            providers: [
              { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
              { resolve: "./src/modules/google-one-tap", id: "google", options: { ...googleAuthConfiguration, oneTapSecret: jwtSecret } },
              { resolve: "@medusajs/medusa/auth-google", id: "google-admin", options: googleAuthConfiguration },
            ],
          },
        }]
      : []),
    ...(algoliaConfiguration
      ? [{ resolve: "./src/modules/algolia", options: algoliaConfiguration }]
      : []),
    { resolve: "./src/modules/vendor-onboarding" },
    { resolve: "./src/modules/inventory" },
    { resolve: "./src/modules/order" },
    { resolve: "./src/modules/seller" },
    { resolve: "./src/modules/commission" },
    { resolve: "./src/modules/commerce-automation" },
    { resolve: "./src/modules/catalog-permission" },
    {
      resolve: "./src/modules/catalog-media",
      options: { storage_enabled: Boolean(productImageStorageConfiguration) },
    },
    {
      resolve: "@mercurjs/core/modules/payout",
      options: {
        // Keep native timing defaults; opt in only after signed-webhook QA.
        disabled: !stripeConfiguration?.jobsEnabled,
        providers: stripeConfiguration
          ? [
              {
                resolve: "@mercurjs/payout-stripe-connect",
                id: "stripe-connect",
                options: {
                  apiKey: stripeConfiguration.apiKey,
                  webhookSecret: stripeConfiguration.webhookSecret,
                },
              },
            ]
          : [],
      },
    },
    ...(stripeConfiguration
      ? [
          {
            resolve: "@medusajs/medusa/payment",
            options: {
              providers: [
                {
                  resolve: "./src/modules/stripe-allocated-payment",
                  id: "stripe",
                  options: {
                    apiKey: stripeConfiguration.apiKey,
                    webhookSecret: stripeConfiguration.paymentWebhookSecret,
                    capture: false,
                    automatic_payment_methods: true,
                  },
                },
              ],
            },
          },
        ]
      : []),
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { channels: ["feed"] },
          },
          ...(resendConfiguration
            ? [
                {
                  resolve: "./src/modules/resend",
                  id: "resend",
                  options: { channels: ["email"], ...resendConfiguration },
                },
              ]
            : []),
        ],
      },
    },
    // Clear retained entries with `pnpm redis:cache:clear` before re-enabling
    // after a disabled period; see docs/local-development.md.
    ...(cachingFlagRouter.isFeatureEnabled(CachingFeatureFlag.key) ? [{
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/caching-redis",
            id: "caching-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    }] : []),
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl,
        // Wait on Redis's queue marker; new events wake the worker immediately.
        workerOptions: { drainDelay: 60 },
        // Auth delivery failures must be retried by the existing event bus.
        jobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
        },
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: {
        redis: {
          redisUrl,
          // Applies to all three workers; delayed jobs retain BullMQ's timeout.
          workerOptions: { drainDelay: 60 },
        },
      },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    },
    {
      resolve: "@mercurjs/core/modules/admin-ui",
      options: {
        // apps/admin is an independent Next.js service, not a Mercur Vite app.
        disable: true,
      },
    },
    {
      resolve: "@mercurjs/core/modules/vendor-ui",
      options: {
        // apps/vendor is an independent Next.js service, not a Mercur Vite app.
        disable: true,
      },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: productImageStorageConfiguration
          ? [
              {
                resolve: "./src/modules/product-media-file",
                id: "product-media",
                options: productImageStorageConfiguration,
              },
            ]
          : [
              {
                resolve: "@medusajs/medusa/file-local",
                id: "local",
                options: {
                  backend_url:
                    process.env.FILE_BACKEND_URL ||
                    "http://localhost:9000/static",
                },
              },
            ],
      },
    },
  ],
});
