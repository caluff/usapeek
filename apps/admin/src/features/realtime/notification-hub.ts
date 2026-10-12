import {
  createAdminNotificationConnection,
  type NotificationSource,
} from "./notification-connection";
import type { AdminNotificationEvent } from "@usapeek/api/order-notification-contracts";

const EVENTS = [
  "orders-changed",
  "catalog-changed",
  "stores-changed",
  "applications-changed",
  "finance-reporting-changed",
] as const satisfies readonly AdminNotificationEvent[];

export type { AdminNotificationEvent };
type Listener = {
  eventName: AdminNotificationEvent;
  onReady: () => void;
  onChanged: () => void;
  onUnavailable: () => void;
};

export function createAdminNotificationHub({
  createSource,
  isVisible,
  observeVisibility,
}: {
  createSource: () => NotificationSource;
  isVisible: () => boolean;
  observeVisibility: (changed: () => void) => () => void;
}) {
  const listeners = new Set<Listener>();
  let stopObserving: (() => void) | undefined;
  let isReady = false;
  const connection = createAdminNotificationConnection({
    createSource,
    eventName: EVENTS,
    onReady: () => {
      isReady = true;
      for (const listener of [...listeners]) listener.onReady();
    },
    onChanged: (eventName) => {
      for (const listener of [...listeners])
        if (listener.eventName === eventName) listener.onChanged();
    },
    onUnavailable: () => {
      isReady = false;
      for (const listener of [...listeners]) listener.onUnavailable();
    },
  });

  function visibilityChanged() {
    if (isVisible()) connection.connect();
    else {
      isReady = false;
      connection.disconnect();
    }
  }

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      if (!stopObserving) {
        stopObserving = observeVisibility(visibilityChanged);
        visibilityChanged();
      } else if (isReady && isVisible()) {
        // Views mounted after readiness must catch up without reopening SSE.
        listener.onReady();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        stopObserving?.();
        stopObserving = undefined;
        isReady = false;
        connection.disconnect();
      };
    },
  };
}
