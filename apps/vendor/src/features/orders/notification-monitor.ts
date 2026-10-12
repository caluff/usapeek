export const ORDER_NOTIFICATION_REFRESH_MS = 30_000;
export const ORDER_NOTIFICATION_CHANGED = "vendor-orders-changed";

// Kept within the mounted seller workspace: never share results across sellers.
export function createOrderNotificationMonitor(
  request: (signal: AbortSignal, fresh: boolean) => Promise<boolean | null>,
  onChange: (hasPendingOrders: boolean) => void,
  now = Date.now,
) {
  let lastAttempt = -Infinity;
  let inFlight: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let refreshQueued = false;
  let freshQueued = false;
  let disposed = false;

  function check(force = false, fresh = false): Promise<void> {
    if (disposed) return Promise.resolve();
    if (inFlight) {
      if (force) {
        refreshQueued = true;
        freshQueued ||= fresh;
      }
      return inFlight;
    }
    if (!force && now() - lastAttempt < ORDER_NOTIFICATION_REFRESH_MS)
      return Promise.resolve();

    lastAttempt = now();
    controller = new AbortController();
    const signal = controller.signal;
    timeout = setTimeout(() => controller?.abort(), 10_000);
    inFlight = (async () => {
      try {
        const result = await request(signal, fresh);
        if (!disposed && !signal.aborted && !refreshQueued)
          onChange(result ?? false);
      } catch {
        // A temporary outage must not erase a previously confirmed pending order.
      } finally {
        clearTimeout(timeout);
        inFlight = null;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          const needsFreshResult = freshQueued;
          freshQueued = false;
          await check(true, needsFreshResult);
        }
      }
    })();
    return inFlight;
  }

  return {
    check,
    dispose() {
      disposed = true;
      clearTimeout(timeout);
      controller?.abort();
    },
  };
}
