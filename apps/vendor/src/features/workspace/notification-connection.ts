export type NotificationSource = {
  addEventListener(type: string, listener: () => void): void;
  close(): void;
};

export function createSellerNotificationConnection({
  createSource,
  eventName,
  onReady,
  onChanged,
  onUnavailable,
}: {
  createSource: () => NotificationSource;
  eventName: string | readonly string[];
  onReady: () => void;
  onChanged: (eventName: string) => void;
  onUnavailable: () => void;
}) {
  let source: NotificationSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retry = 0;
  let isActive = false;

  function connect() {
    isActive = true;
    if (source || timer) return;
    const current = createSource();
    source = current;
    current.addEventListener("ready", () => {
      if (source !== current) return;
      retry = 0;
      onReady();
    });
    for (const name of typeof eventName === "string" ? [eventName] : eventName)
      current.addEventListener(name, () => {
        if (source === current) onChanged(name);
      });
    current.addEventListener("error", () => {
      if (source !== current) return;
      current.close();
      source = null;
      onUnavailable();
      timer = setTimeout(
        () => {
          timer = undefined;
          if (isActive) connect();
        },
        Math.min(1_000 * 2 ** retry++, 30_000),
      );
    });
  }

  return {
    connect,
    disconnect() {
      isActive = false;
      clearTimeout(timer);
      timer = undefined;
      source?.close();
      source = null;
    },
  };
}
