import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  defineConfig,
  isSharedConnectionSymbol,
  MedusaError,
} from "@medusajs/framework/utils";

function requireLocal(value: unknown): asserts value {
  if (!value)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Native finance QA requires Redis TLS at localhost:56379/15 without connection overrides.",
    );
}

function localUrl(value: unknown) {
  requireLocal(typeof value === "string" && value.length > 0);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    requireLocal(false);
  }
  requireLocal(
    url.protocol === "rediss:" &&
      url.hostname === "localhost" &&
      url.port === "56379" &&
      url.pathname === "/15" &&
      !url.search &&
      !url.hash,
  );
  return url.href;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Check both the launcher environment and the effective Medusa configuration. */
export function assertNativeFinanceRedis(
  environment: NodeJS.ProcessEnv,
  configuration?: unknown,
) {
  requireLocal(
    environment.NODE_EXTRA_CA_CERTS &&
      existsSync(environment.NODE_EXTRA_CA_CERTS) &&
      environment.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
  );
  const expected = localUrl(environment.REDIS_URL);
  if (configuration === undefined) return;
  requireLocal(record(configuration) && record(configuration.projectConfig));
  requireLocal(localUrl(configuration.projectConfig.redisUrl) === expected);
  const requireEmptyOptions = (value: unknown) =>
    requireLocal(
      value === undefined || (record(value) && Object.keys(value).length === 0),
    );
  const projectOptions = configuration.projectConfig.redisOptions;
  if (record(projectOptions) && "retryStrategy" in projectOptions) {
    // defineConfig always adds this native backoff callback, even for URL-only
    // configuration. Compare the installed implementation without invoking an
    // unknown callback or trusting a user-defined `toString` method.
    const nativeRetry =
      defineConfig().projectConfig.redisOptions?.retryStrategy;
    requireLocal(
      Object.keys(projectOptions).length === 1 &&
        typeof projectOptions.retryStrategy === "function" &&
        typeof nativeRetry === "function" &&
        Function.prototype.toString.call(projectOptions.retryStrategy) ===
          Function.prototype.toString.call(nativeRetry),
    );
  } else requireEmptyOptions(projectOptions);

  const eventBusOptions = new WeakSet<object>();
  const spamProtectionOptions = new WeakSet<object>();
  const requireConnection = (value: unknown) => {
    requireLocal(record(value));
    requireLocal(localUrl(value.redisUrl) === expected);
    // caching-redis forwards unknown top-level keys to ioredis. These are the
    // native non-connection options used by the installed Redis modules.
    const allowed = new Set([
      "redisUrl",
      "redisOptions",
      "options",
      "pubsub",
      "workerOptions",
      "jobOptions",
      "queueOptions",
      "ttl",
      "prefix",
      "compressionThreshold",
    ]);
    if (spamProtectionOptions.has(value) && "hashSecret" in value) {
      const project = configuration.projectConfig;
      requireLocal(record(project));
      const http = project.http;
      requireLocal(
        record(http) &&
          typeof http.cookieSecret === "string" &&
          value.hashSecret === http.cookieSecret,
      );
      allowed.add("hashSecret");
    }
    // MedusaApp injects shared SQL metadata into every internal module. The
    // event-bus loader ignores it; Redis providers must still reject this key.
    if (eventBusOptions.has(value) && "database" in value) {
      const database = value.database;
      const project = configuration.projectConfig;
      requireLocal(record(project));
      requireLocal(
        Reflect.get(value, isSharedConnectionSymbol) === true &&
          record(database) &&
          Object.keys(database).every((key) =>
            [
              "clientUrl",
              "schema",
              "driverOptions",
              "pool",
              "debug",
              "connection",
            ].includes(key),
          ) &&
          typeof project.databaseUrl === "string" &&
          database.clientUrl === project.databaseUrl &&
          typeof database.schema === "string" &&
          database.connection === undefined &&
          database.debug === (project.databaseLogging ?? false) &&
          record(database.driverOptions) &&
          (project.databaseDriverOptions === undefined ||
            isDeepStrictEqual(
              database.driverOptions,
              project.databaseDriverOptions,
            )) &&
          isDeepStrictEqual(
            database.pool,
            record(project.databaseDriverOptions)
              ? (project.databaseDriverOptions.pool ?? {})
              : {},
          ),
      );
      allowed.add("database");
    }
    const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknownKeys.length)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Native finance QA rejected unverified Redis option keys: ${unknownKeys.join(", ")}.`,
      );
    requireEmptyOptions(value.redisOptions);
    // The workflow engine also accepts legacy `redis.options`.
    requireEmptyOptions(value.options);
    if (value.pubsub !== undefined) {
      requireLocal(record(value.pubsub));
      requireLocal(
        Object.keys(value.pubsub).every((key) =>
          ["url", "options"].includes(key),
        ),
      );
      requireLocal(localUrl(value.pubsub.url) === expected);
      requireEmptyOptions(value.pubsub.options);
    }
  };

  const seen = new WeakSet<object>();
  const inspect = (value: unknown) => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (record(value)) {
      if ("redisUrl" in value) requireConnection(value);
      // Do not let a provider omit its URL and silently use a fallback target.
      const resolution = value.resolve;
      if (typeof resolution === "string") {
        if (
          resolution
            .replaceAll("\\", "/")
            .endsWith("/src/modules/spam-protection") &&
          record(value.options)
        )
          spamProtectionOptions.add(value.options);
        if (
          resolution === "@medusajs/medusa/event-bus-redis" &&
          record(value.options)
        )
          eventBusOptions.add(value.options);
        if (resolution.endsWith("/workflow-engine-redis")) {
          requireLocal(record(value.options));
          requireConnection(value.options.redis);
        } else if (
          ["/caching-redis", "/locking-redis", "/event-bus-redis"].some(
            (name) => resolution.endsWith(name),
          )
        ) {
          requireConnection(value.options);
        }
      }
    }
    for (const [key, nested] of Object.entries(value)) {
      // This fixture uses URL-only Redis configuration in every native module.
      // Extra connection options can add alternate transports or change TLS.
      if (key === "redisOptions") requireEmptyOptions(nested);
      inspect(nested);
    }
  };
  inspect(configuration.modules);
}
