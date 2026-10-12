import type {
  ConfigModule,
  ExecArgs,
  ICachingModuleService,
  Logger,
} from "@medusajs/framework/types";
import Redis from "ioredis";
import { REDIS_CONNECTION_OPTIONS } from "../lib/redis-options";
import { z } from "@medusajs/framework/zod";
import {
  ContainerRegistrationKeys,
  FeatureFlag,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";

const providerConfigurationSchema = z.object({
  options: z.object({
    providers: z.tuple([z.object({
      resolve: z.literal("@medusajs/medusa/caching-redis"),
      id: z.literal("caching-redis"),
      is_default: z.literal(true),
      options: z.object({
        redisUrl: z.url().regex(/^rediss?:\/\//),
        prefix: z.literal("mc:").default("mc:"),
      }).strict(),
    })]),
  }),
});

const MAX_SCAN_PAGES = 1_000;
const SCAN_DEADLINE_MS = 10_000;

export default async function clearQueryCache({ container }: ExecArgs) {
  const configuration = container.resolve<ConfigModule>(
    ContainerRegistrationKeys.CONFIG_MODULE,
  );
  if (
    configuration.projectConfig.workerMode !== "server" ||
    !FeatureFlag.isFeatureEnabled("caching")
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Query-cache invalidation requires workerMode=server and MEDUSA_FF_CACHING=true.",
    );
  }

  const caching = container.resolve<ICachingModuleService>(Modules.CACHING, {
    allowUnregistered: true,
  });
  if (!caching) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The query-caching module must be configured before invalidation.",
    );
  }

  const provider = providerConfigurationSchema.safeParse(
    configuration.modules?.[Modules.CACHING],
  );
  if (!provider.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Query-cache verification requires the single native Redis provider and its mc: namespace.",
    );
  }

  const { redisUrl, prefix } = provider.data.options.providers[0].options;
  const verification = new Redis(redisUrl, {
    ...REDIS_CONNECTION_OPTIONS,
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  verification.on("error", () => undefined);
  try {
    await verification.connect().catch(() => {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Unable to connect for query-cache verification; keep traffic stopped.",
      );
    });
    await caching.clear({ tags: ["*"] });

    // Native flush logs and swallows connection failures; verify independently.
    const deadline = Date.now() + SCAN_DEADLINE_MS;
    let cursor = "0";
    let pages = 0;
    do {
      if (pages++ >= MAX_SCAN_PAGES || Date.now() >= deadline) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Query-cache verification exceeded its scan limit; keep traffic stopped.",
        );
      }
      const [next, keys] = await verification.scan(
        cursor, "MATCH", `${prefix}*`, "COUNT", 1_000,
      ).catch(() => {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Query-cache verification failed; keep traffic stopped.",
        );
      });
      if (keys.length) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "The query-cache namespace is not empty; keep traffic stopped.",
        );
      }
      cursor = next;
    } while (cursor !== "0");

    container.resolve<Logger>(ContainerRegistrationKeys.LOGGER).info(
      "[query-cache] Invalidation verified: the configured namespace is empty.",
    );
  } finally {
    verification.disconnect();
  }
}
