// Preserve ioredis 5's wire protocol and connection defaults when using SDK 6.
export const REDIS_CONNECTION_OPTIONS = {
  protocol: 2 as const,
  keepAlive: 0,
  retryStrategy: (times: number) => Math.min(times * 50, 2_000),
};
