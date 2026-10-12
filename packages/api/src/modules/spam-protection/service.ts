import { createHmac } from "node:crypto";
import Redis from "ioredis";
import { REDIS_CONNECTION_OPTIONS } from "../../lib/redis-options";
import type { Logger } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import type { SpamProtectionBucket } from "../../lib/spam-protection/policy";

// Check every budget before incrementing any, in one atomic Redis operation.
// Expirations belong to the first accepted request, not the latest attempt.
export const CONSUME_SPAM_BUDGET = `
local retry = 0
local missing = {}
for i, key in ipairs(KEYS) do
  local current = redis.call('GET', key)
  local count = tonumber(current or '0')
  if not current then missing[key] = true end
  local limit = tonumber(ARGV[i * 2 - 1])
  local seconds = tonumber(ARGV[i * 2])
  if count >= limit then
    local ttl = redis.call('PTTL', key)
    if ttl < 0 then
      redis.call('EXPIRE', key, seconds)
      ttl = seconds * 1000
    end
    retry = math.max(retry, math.max(1, ttl))
  end
end
if retry > 0 then return math.max(1, math.ceil(retry / 1000)) end
for i, key in ipairs(KEYS) do
  if missing[key] then
    redis.call('SET', key, '1', 'EX', tonumber(ARGV[i * 2]))
    missing[key] = nil
  elseif redis.call('INCR', key) == 1 then
    redis.call('EXPIRE', key, tonumber(ARGV[i * 2]))
  end
end
return 0`;

export default class SpamProtectionService {
  private redis: Redis;
  private hashSecret: string;
  private isClosed = false;

  constructor(
    { logger }: { logger: Logger },
    options: { redisUrl: string; hashSecret: string },
  ) {
    if (!options.redisUrl || !options.hashSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Spam protection is not configured.",
      );
    }
    this.hashSecret = options.hashSecret;
    this.redis = new Redis(options.redisUrl, {
      ...REDIS_CONNECTION_OPTIONS,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    let hasReportedConnectionError = false;
    this.redis.on("error", () => {
      if (!hasReportedConnectionError)
        logger.warn("Spam protection is temporarily unavailable.");
      hasReportedConnectionError = true;
    });
    this.redis.on("ready", () => {
      hasReportedConnectionError = false;
    });
  }

  async consume(buckets: SpamProtectionBucket[]): Promise<number> {
    if (!buckets.length) return 0;
    const keys = buckets.map(
      ({ scope, subject }) =>
        `marketplace:spam:${scope}:${createHmac("sha256", this.hashSecret).update(subject).digest("hex")}`,
    );
    const args = buckets.flatMap(({ limit, windowSeconds }) => [
      limit,
      windowSeconds,
    ]);
    const retryAfter = await this.redis.eval(
      CONSUME_SPAM_BUDGET,
      keys.length,
      ...keys,
      ...args,
    );
    if (
      typeof retryAfter !== "number" ||
      !Number.isSafeInteger(retryAfter) ||
      retryAfter < 0
    ) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Spam protection returned an invalid result.",
      );
    }
    return retryAfter;
  }

  private shutdown = async () => {
    if (this.isClosed) return;
    this.isClosed = true;
    this.redis.disconnect();
  };

  __hooks = {
    onApplicationPrepareShutdown: this.shutdown,
    onApplicationShutdown: this.shutdown,
  };
}
