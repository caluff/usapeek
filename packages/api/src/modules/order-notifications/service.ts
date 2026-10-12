import Redis from "ioredis";
import { REDIS_CONNECTION_OPTIONS } from "../../lib/redis-options";
import type { Logger } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import type { AdminNotificationEvent } from "../../lib/admin-notifications/contracts";

const PREFIX = "marketplace:order-notifications:";
const ADMIN_PREFIX = "marketplace:admin-notifications:";
const CACHE_SECONDS = 300;
const WRITE_SNAPSHOT = `
if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1`;
const INVALIDATE = `
redis.call('INCR', KEYS[1])
redis.call('PUBLISH', ARGV[1], ARGV[2])
return 1`;

type NotificationMessage =
  | AdminNotificationEvent
  | "orders-changed"
  | "settlements-changed"
  | "finance-reporting-changed"
  | "catalog-changed";
type Listener = {
  changed: () => void;
  closed: () => void;
  message: NotificationMessage;
};

// No commerce data is stored here: only a versioned boolean projection and
// seller-scoped invalidation signals shared by API and worker instances.
export default class OrderNotificationsService {
  private publisher: Redis;
  private subscriber: Redis;
  private logger: Logger;
  private listeners = new Map<string, Set<Listener>>();
  private subscriptions = new Map<string, Promise<unknown>>();
  private snapshots = new Map<string, Promise<boolean>>();
  private isClosed = false;

  constructor({ logger }: { logger: Logger }, options: { redisUrl: string }) {
    this.logger = logger;
    const redisOptions = {
      ...REDIS_CONNECTION_OPTIONS,
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
    };
    this.publisher = new Redis(options.redisUrl, redisOptions);
    this.subscriber = new Redis(options.redisUrl, redisOptions);
    for (const connection of [this.publisher, this.subscriber]) {
      connection.on("error", () => {
        this.logger.warn("Order notification Redis connection unavailable.");
      });
    }
    this.subscriber.on("message", (channel, message) => {
      for (const listener of this.listeners.get(channel) ?? []) {
        if (message !== listener.message) continue;
        try {
          listener.changed();
        } catch {
          listener.closed();
        }
      }
    });
    this.subscriber.on("ready", () => {
      // Redis Pub/Sub does not replay messages lost during a disconnection.
      // Catch up from the versioned snapshot when the transport recovers.
      for (const listeners of this.listeners.values())
        for (const listener of listeners) listener.changed();
    });
  }

  private base(sellerId: string) {
    if (!sellerId)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Seller scope is required.",
      );
    return `${PREFIX}${encodeURIComponent(sellerId)}`;
  }

  async snapshot(
    sellerId: string,
    compute: () => Promise<boolean>,
    fresh = false,
  ) {
    const base = this.base(sellerId);
    return this.snapshotBoolean(base, compute, fresh);
  }

  async adminSnapshot(
    topic: "applications-changed" | "catalog-changed",
    compute: () => Promise<boolean>,
    fresh = false,
  ) {
    return this.snapshotBoolean(`${ADMIN_PREFIX}${topic}`, compute, fresh);
  }

  private async snapshotBoolean(
    base: string,
    compute: () => Promise<boolean>,
    fresh: boolean,
  ) {
    // Local mutations precede asynchronous worker invalidation. Never reuse or
    // overwrite a read that began before that mutation under the same epoch.
    if (fresh) return compute();
    const versionKey = `${base}:version`;
    let version: string;
    try {
      version = (await this.publisher.get(versionKey)) ?? "0";
      const cached = await this.publisher.get(`${base}:snapshot:${version}`);
      if (cached === "1" || cached === "0") return cached === "1";
    } catch {
      // Redis failure must not fabricate an empty order queue.
      return compute();
    }
    const key = `${base}:snapshot:${version}`;
    const running = this.snapshots.get(key);
    if (running) return running;
    const result = (async () => {
      const pending = await compute();
      try {
        // An invalidation arriving during the read must never cache an old
        // result under the new version. The browser receives that invalidation.
        await this.publisher.eval(
          WRITE_SNAPSHOT,
          2,
          versionKey,
          key,
          version,
          pending ? "1" : "0",
          CACHE_SECONDS,
        );
      } catch {
        // The live database read remains usable when the cache is unavailable.
      }
      return pending;
    })();
    this.snapshots.set(key, result);
    try {
      return await result;
    } finally {
      this.snapshots.delete(key);
    }
  }

  async invalidate(sellerId: string) {
    const base = this.base(sellerId);
    // Epoch change and publication are atomic, so event recipients never read
    // the previous cached version even across separate worker/API processes.
    await this.publisher.eval(
      INVALIDATE,
      1,
      `${base}:version`,
      `${base}:events`,
      "orders-changed",
    );
  }

  async publishAdminChanged(topic: AdminNotificationEvent) {
    const base = `${ADMIN_PREFIX}${topic}`;
    if (
      topic === "orders-changed" ||
      topic === "stores-changed" ||
      topic === "finance-reporting-changed"
    ) {
      // These topics signal live views without a cached boolean snapshot.
      await this.publisher.publish(`${base}:events`, topic);
      return;
    }
    await this.publisher.eval(
      INVALIDATE,
      1,
      `${base}:version`,
      `${base}:events`,
      topic,
    );
  }

  async subscribeAdmin(
    topic: AdminNotificationEvent,
    changed: () => void,
    closed: () => void,
  ) {
    return this.subscribeTopic(
      `${ADMIN_PREFIX}${topic}:events`,
      topic,
      changed,
      closed,
    );
  }

  async subscribe(sellerId: string, changed: () => void, closed: () => void) {
    return this.subscribeTopic(
      `${this.base(sellerId)}:events`,
      "orders-changed",
      changed,
      closed,
    );
  }

  async publishSettlementsChanged(sellerId: string) {
    await this.publisher.publish(
      `${this.base(sellerId)}:settlements-events`,
      "settlements-changed",
    );
  }

  async subscribeSettlements(
    sellerId: string,
    changed: () => void,
    closed: () => void,
  ) {
    return this.subscribeTopic(
      `${this.base(sellerId)}:settlements-events`,
      "settlements-changed",
      changed,
      closed,
    );
  }

  async publishReportingChanged(sellerId: string) {
    await this.publisher.publish(
      `${this.base(sellerId)}:reporting-events`,
      "finance-reporting-changed",
    );
  }

  async subscribeReporting(
    sellerId: string,
    changed: () => void,
    closed: () => void,
  ) {
    return this.subscribeTopic(
      `${this.base(sellerId)}:reporting-events`,
      "finance-reporting-changed",
      changed,
      closed,
    );
  }

  async publishCatalogChanged(sellerId: string) {
    await this.publisher.publish(
      `${this.base(sellerId)}:catalog-events`,
      "catalog-changed",
    );
  }

  async subscribeCatalog(
    sellerId: string,
    changed: () => void,
    closed: () => void,
  ) {
    return this.subscribeTopic(
      `${this.base(sellerId)}:catalog-events`,
      "catalog-changed",
      changed,
      closed,
    );
  }

  private async subscribeTopic(
    channel: string,
    message: NotificationMessage,
    changed: () => void,
    closed: () => void,
  ) {
    if (this.isClosed)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Order notifications are shutting down.",
      );
    const listener = { changed, closed, message };
    let listeners = this.listeners.get(channel);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(channel, listeners);
      this.subscriptions.set(channel, this.subscriber.subscribe(channel));
    }
    listeners.add(listener);
    const dispose = () => {
      listeners.delete(listener);
      if (listeners.size || this.listeners.get(channel) !== listeners) return;
      this.listeners.delete(channel);
      this.subscriptions.delete(channel);
      void this.subscriber.unsubscribe(channel).catch(() => {});
    };
    try {
      await this.subscriptions.get(channel);
      if (this.isClosed)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Order notifications are shutting down.",
        );
      return dispose;
    } catch (error) {
      dispose();
      throw error;
    }
  }

  private shutdown = async () => {
    if (this.isClosed) return;
    this.isClosed = true;
    for (const listeners of this.listeners.values())
      for (const listener of [...listeners]) listener.closed();
    this.listeners.clear();
    this.subscriptions.clear();
    this.publisher.disconnect();
    this.subscriber.disconnect();
  };

  __hooks = {
    onApplicationPrepareShutdown: this.shutdown,
    onApplicationShutdown: this.shutdown,
  };
}
