/** Opt-in service regression against the exclusively owned disposable Redis. */
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { logger } from "@medusajs/framework/logger";
import { z } from "@medusajs/framework/zod";
import Redis from "ioredis";
import { assertNativeFinanceRedis } from "../../../../integration-tests/helpers/native-finance-redis-guard";
import type { AdminNotificationEvent } from "../../../lib/admin-notifications/contracts";
import type { SpamProtectionBucket } from "../../../lib/spam-protection/policy";
import OrderNotificationsService from "../service";
import SpamProtectionService from "../../spam-protection/service";

function disposableRedisUrl() {
  const reject = () => {
    throw new Error(
      "Redis efficiency tests require the Redis audit importer, an explicit ownership manifest, and exclusively owned TLS localhost:56379/15.",
    );
  };
  assertNativeFinanceRedis(process.env);
  const owner = process.env.CLOSURE_FINAL_INTEGRATION;
  if (
    process.env.NODE_ENV !== "test" ||
    !owner ||
    !/^redis-audit-[0-9]{8}(?:-[a-z0-9]+)?$/.test(owner) ||
    !process.env.REDIS_EFFICIENCY_MANIFEST
  )
    reject();
  const url = new URL(process.env.REDIS_URL || "invalid:");
  if (
    url.protocol !== "rediss:" ||
    url.hostname !== "localhost" ||
    url.port !== "56379" ||
    url.pathname !== "/15" ||
    url.username !== "closure" ||
    !url.password ||
    url.search ||
    url.hash
  )
    reject();
  const certificate = realpathSync(process.env.NODE_EXTRA_CA_CERTS!);
  const manifest = z
    .object({
      ownerLabel: z.literal(`marketplace.closure-test=${owner}`),
      certificatePath: z.string(),
      certificateSha256: z.string(),
      redis: z.object({
        id: z.string().regex(/^[a-f0-9]{64}$/),
        name: z.literal(`marketplace-closure-${owner}-redis`),
        port: z.literal(56379),
        database: z.literal(15),
        user: z.literal("closure"),
      }),
    })
    .safeParse(
      JSON.parse(readFileSync(process.env.REDIS_EFFICIENCY_MANIFEST!, "utf8")),
    );
  if (!manifest.success) reject();
  const ownership = manifest.data!;
  if (
    realpathSync(ownership.certificatePath) !== certificate ||
    createHash("sha256")
      .update(readFileSync(certificate))
      .digest("hex")
      .toUpperCase() !== ownership.certificateSha256.toUpperCase()
  )
    reject();
  const inspected = spawnSync("docker", ["inspect", ownership.redis.id], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (inspected.status !== 0) reject();
  const container = z
    .array(
      z.object({
        Id: z.string(),
        Name: z.string(),
        State: z.object({ Running: z.boolean() }),
        Config: z.object({ Labels: z.record(z.string(), z.string()) }),
        NetworkSettings: z.object({
          Ports: z.record(
            z.string(),
            z
              .array(z.object({ HostIp: z.string(), HostPort: z.string() }))
              .nullable(),
          ),
        }),
      }),
    )
    .length(1)
    .safeParse(JSON.parse(inspected.stdout));
  if (!container.success) reject();
  const identity = container.data![0];
  const binding = identity.NetworkSettings.Ports["6379/tcp"];
  if (
    identity.Id !== ownership.redis.id ||
    identity.Name !== `/${ownership.redis.name}` ||
    !identity.State.Running ||
    identity.Config.Labels["marketplace.closure-test"] !== owner ||
    binding?.length !== 1 ||
    binding[0].HostIp !== "127.0.0.1" ||
    binding[0].HostPort !== "56379"
  )
    reject();
  return url.href;
}

if (process.env.REDIS_EFFICIENCY_TESTS !== "disposable-local") {
  describe.skip("Redis efficiency (requires disposable-local)", () => {
    it("requires the exclusive Redis audit importer", () => {});
  });
} else {
  describe("Redis service efficiency on disposable TLS infrastructure", () => {
    jest.setTimeout(15_000);
    const runId = randomUUID();
    const hashSecret = randomUUID();
    const ownedKeys = new Set<string>();
    let redis: Redis;
    let spam: SpamProtectionService;
    let notifications: OrderNotificationsService;

    function bucket(limit = 10, windowSeconds = 60): SpamProtectionBucket {
      return {
        scope: `redis-efficiency-${runId}`,
        subject: randomUUID(),
        limit,
        windowSeconds,
      };
    }
    function spamKey(value: SpamProtectionBucket) {
      const key = `marketplace:spam:${value.scope}:${createHmac("sha256", hashSecret).update(value.subject).digest("hex")}`;
      ownedKeys.add(key);
      return key;
    }
    function sellerBase(sellerId: string) {
      return `marketplace:order-notifications:${encodeURIComponent(sellerId)}`;
    }
    async function reserve(...keys: string[]) {
      if (await redis.exists(...keys))
        throw new Error(
          "A fixed notification test key already exists; refusing to overwrite it.",
        );
      for (const key of keys) ownedKeys.add(key);
    }
    async function waitFor(check: () => boolean | Promise<boolean>) {
      const deadline = Date.now() + 3_000;
      while (!(await check())) {
        if (Date.now() >= deadline)
          throw new Error(
            "Timed out waiting for the disposable Redis service.",
          );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    async function subscribers(channel: string) {
      const counts = await redis.pubsub("NUMSUB", channel);
      return Number(counts[1]);
    }
    async function commandDelta(action: () => Promise<unknown>) {
      const parse = (info: string) =>
        Object.fromEntries(
          info
            .split("\r\n")
            .filter((line) => line.startsWith("cmdstat_"))
            .map((line) => [
              line.slice(8, line.indexOf(":")),
              Number(line.match(/calls=(\d+)/)?.[1] ?? 0),
            ]),
        );
      const before = parse(await redis.info("commandstats"));
      await action();
      const after = parse(await redis.info("commandstats"));
      return (name: string) => (after[name] ?? 0) - (before[name] ?? 0);
    }

    beforeAll(async () => {
      const redisUrl = disposableRedisUrl();
      redis = new Redis(redisUrl, {
        lazyConnect: true,
        protocol: 2,
        connectionName: `redis-efficiency:${runId}`,
        connectTimeout: 2_000,
        commandTimeout: 2_000,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        tls: { rejectUnauthorized: true },
      });
      await redis.connect();
      spam = new SpamProtectionService({ logger }, { redisUrl, hashSecret });
      notifications = new OrderNotificationsService({ logger }, { redisUrl });
      const warmup = bucket();
      spamKey(warmup);
      await waitFor(async () => {
        try {
          return (await spam.consume([warmup])) === 0;
        } catch {
          return false;
        }
      });
    });

    afterEach(async () => {
      if (!redis || !ownedKeys.size) return;
      await redis.del(...ownedKeys);
      ownedKeys.clear();
    });

    afterAll(async () => {
      await spam?.__hooks.onApplicationShutdown();
      await notifications?.__hooks.onApplicationShutdown();
      if (redis) {
        if (ownedKeys.size) await redis.del(...ownedKeys);
        await redis.quit();
      }
    });

    it("creates new counters with one expiring SET instead of INCR plus EXPIRE", async () => {
      const values = [bucket(), bucket(20, 120)];
      const keys = values.map(spamKey);
      const delta = await commandDelta(() => spam.consume(values));
      expect(delta("eval")).toBe(1);
      expect(delta("get")).toBe(2);
      expect(delta("set")).toBe(2);
      expect(delta("incr")).toBe(0);
      expect(delta("expire")).toBe(0);
      expect(await redis.mget(...keys)).toEqual(["1", "1"]);
      expect(await redis.pttl(keys[0])).toBeGreaterThan(59_000);
      expect(await redis.pttl(keys[1])).toBeGreaterThan(119_000);
    });

    it("does not extend an existing counter window", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, 3, "PX", 30_000);
      expect(await spam.consume([value])).toBe(0);
      expect(await redis.get(key)).toBe("4");
      expect(await redis.pttl(key)).toBeLessThanOrEqual(30_000);
      expect(await redis.pttl(key)).toBeGreaterThan(29_000);
    });

    it("starts the accepted window when an existing counter is zero", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, 0, "PX", 30_000);
      expect(await spam.consume([value])).toBe(0);
      expect(await redis.get(key)).toBe("1");
      expect(await redis.pttl(key)).toBeGreaterThan(59_000);
    });

    it("does not create a fresh budget when another budget blocks", async () => {
      const blocked = bucket();
      const fresh = bucket();
      await redis.set(spamKey(blocked), 10, "EX", 60);
      expect(await spam.consume([fresh, blocked])).toBeGreaterThan(0);
      expect(await redis.get(spamKey(fresh))).toBeNull();
      expect(await redis.get(spamKey(blocked))).toBe("10");
    });

    it("repairs a blocked counter without an expiration", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, 10);
      expect(await spam.consume([value])).toBe(60);
      expect(await redis.get(key)).toBe("10");
      expect(await redis.pttl(key)).toBeGreaterThan(59_000);
    });

    it("preserves an accepted existing persistent counter", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, 3);
      expect(await spam.consume([value])).toBe(0);
      expect(await redis.get(key)).toBe("4");
      expect(await redis.pttl(key)).toBe(-1);
    });

    it("counts duplicate absent keys twice and retains the first window", async () => {
      const value = bucket(1);
      const key = spamKey(value);
      expect(
        await spam.consume([value, { ...value, windowSeconds: 120 }]),
      ).toBe(0);
      expect(await redis.get(key)).toBe("2");
      expect(await redis.pttl(key)).toBeGreaterThan(59_000);
      expect(await redis.pttl(key)).toBeLessThanOrEqual(60_000);
    });

    it("counts duplicate zero keys twice and resets only their first window", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, 0, "EX", 30);
      expect(
        await spam.consume([value, { ...value, windowSeconds: 120 }]),
      ).toBe(0);
      expect(await redis.get(key)).toBe("2");
      expect(await redis.pttl(key)).toBeGreaterThan(59_000);
      expect(await redis.pttl(key)).toBeLessThanOrEqual(60_000);
    });

    it("counts duplicate existing keys twice", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, 3, "EX", 30);
      expect(await spam.consume([value, value])).toBe(0);
      expect(await redis.get(key)).toBe("5");
      expect(await redis.pttl(key)).toBeLessThanOrEqual(30_000);
    });

    it("preserves the increment semantics of a negative existing counter", async () => {
      const value = bucket();
      const key = spamKey(value);
      await redis.set(key, -1, "EX", 30);
      expect(await spam.consume([value])).toBe(0);
      expect(await redis.get(key)).toBe("0");
      expect(await redis.pttl(key)).toBeLessThanOrEqual(30_000);
    });

    it("rejects malformed counters without creating a peer counter", async () => {
      const corrupt = bucket();
      const fresh = bucket();
      await redis.set(spamKey(corrupt), "malformed");
      await expect(spam.consume([fresh, corrupt])).rejects.toBeDefined();
      expect(await redis.get(spamKey(fresh))).toBeNull();
      expect(await redis.get(spamKey(corrupt))).toBe("malformed");
    });

    it("enforces exact limits across simultaneous requests", async () => {
      const values = [bucket(), bucket()];
      values.forEach(spamKey);
      const results = await Promise.all(
        Array.from({ length: 100 }, () => spam.consume(values)),
      );
      expect(results.filter((result) => result === 0)).toHaveLength(10);
      expect(results.filter((result) => result > 0)).toHaveLength(90);
      expect(await redis.mget(...values.map(spamKey))).toEqual(["10", "10"]);
    });

    it("accepts a new budget after the first window expires", async () => {
      const value = bucket(1, 1);
      spamKey(value);
      expect(await spam.consume([value])).toBe(0);
      expect(await spam.consume([value])).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(await spam.consume([value])).toBe(0);
    });

    it("does not send Redis commands for an empty set of budgets", async () => {
      const delta = await commandDelta(() => spam.consume([]));
      expect(delta("eval")).toBe(0);
      expect(delta("get")).toBe(0);
      expect(delta("set")).toBe(0);
    });

    const topics: AdminNotificationEvent[] = [
      "applications-changed",
      "catalog-changed",
      "orders-changed",
      "stores-changed",
      "finance-reporting-changed",
    ];
    it.each(topics)(
      "publishes %s with versioning only when a snapshot consumes it",
      async (topic) => {
        const base = `marketplace:admin-notifications:${topic}`;
        await reserve(`${base}:version`);
        const changed = jest.fn();
        const dispose = await notifications.subscribeAdmin(
          topic,
          changed,
          jest.fn(),
        );
        try {
          changed.mockClear();
          const delta = await commandDelta(() =>
            notifications.publishAdminChanged(topic),
          );
          await waitFor(() => changed.mock.calls.length === 1);
          const versioned =
            topic === "applications-changed" || topic === "catalog-changed";
          expect(await redis.get(`${base}:version`)).toBe(
            versioned ? "1" : null,
          );
          expect(delta("publish")).toBe(1);
          expect(delta("eval")).toBe(versioned ? 1 : 0);
          expect(delta("incr")).toBe(versioned ? 1 : 0);
        } finally {
          dispose();
          await waitFor(
            async () => (await subscribers(`${base}:events`)) === 0,
          );
        }
      },
    );

    it.each(["applications-changed", "catalog-changed"] as const)(
      "invalidates the cached %s snapshot before publication",
      async (topic) => {
        const base = `marketplace:admin-notifications:${topic}`;
        await reserve(
          `${base}:version`,
          `${base}:snapshot:0`,
          `${base}:snapshot:1`,
        );
        expect(
          await notifications.adminSnapshot(topic, async () => false),
        ).toBe(false);
        expect(await notifications.adminSnapshot(topic, async () => true)).toBe(
          false,
        );
        const observed: boolean[] = [];
        const dispose = await notifications.subscribeAdmin(
          topic,
          () => {
            void notifications
              .adminSnapshot(topic, async () => true)
              .then((value) => observed.push(value));
          },
          jest.fn(),
        );
        try {
          await notifications.publishAdminChanged(topic);
          await waitFor(() => observed.length === 1);
          expect(observed).toEqual([true]);
          expect(await redis.get(`${base}:snapshot:1`)).toBe("1");
        } finally {
          dispose();
          await waitFor(
            async () => (await subscribers(`${base}:events`)) === 0,
          );
        }
      },
    );

    it("shares one channel subscription and disposes only after its final listener", async () => {
      const sellerId = `sel_${runId}`;
      const channel = `${sellerBase(sellerId)}:events`;
      const first = jest.fn();
      const second = jest.fn();
      const disposeFirst = await notifications.subscribe(
        sellerId,
        first,
        jest.fn(),
      );
      const disposeSecond = await notifications.subscribe(
        sellerId,
        second,
        jest.fn(),
      );
      try {
        first.mockClear();
        second.mockClear();
        expect(await subscribers(channel)).toBe(1);
        await redis.publish(channel, "orders-changed");
        await waitFor(
          () => first.mock.calls.length === 1 && second.mock.calls.length === 1,
        );
        disposeFirst();
        expect(await subscribers(channel)).toBe(1);
        await redis.publish(channel, "orders-changed");
        await waitFor(() => second.mock.calls.length === 2);
        expect(first).toHaveBeenCalledTimes(1);
        disposeSecond();
        await waitFor(async () => (await subscribers(channel)) === 0);
        expect(await redis.publish(channel, "orders-changed")).toBe(0);
        expect(second).toHaveBeenCalledTimes(2);
      } finally {
        disposeFirst();
        disposeSecond();
      }
    });

    it("does not cache a pending snapshot across a seller invalidation", async () => {
      const sellerId = `sel_${randomUUID()}`;
      const base = sellerBase(sellerId);
      await reserve(
        `${base}:version`,
        `${base}:snapshot:0`,
        `${base}:snapshot:1`,
      );
      let release!: (value: boolean) => void;
      let started!: () => void;
      const computing = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = notifications.snapshot(sellerId, () => {
        started();
        return new Promise<boolean>((resolve) => {
          release = resolve;
        });
      });
      await computing;
      await notifications.invalidate(sellerId);
      release(false);
      expect(await pending).toBe(false);
      expect(await redis.get(`${base}:snapshot:0`)).toBeNull();
      expect(await redis.get(`${base}:snapshot:1`)).toBeNull();
      expect(await notifications.snapshot(sellerId, async () => true)).toBe(
        true,
      );
      expect(await redis.get(`${base}:snapshot:1`)).toBe("1");
    });
  });
}
