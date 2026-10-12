const ORDER_EVENT = "marketplace:vendor-order-event";

export function publishDashboardOrderEvent(
  sellerId: string,
  target: EventTarget = window,
) {
  target.dispatchEvent(new CustomEvent(ORDER_EVENT, { detail: sellerId }));
}

export function subscribeDashboardOrderEvents(
  sellerId: string,
  changed: () => void,
  target: EventTarget = window,
) {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && event.detail === sellerId) changed();
  };
  target.addEventListener(ORDER_EVENT, listener);
  return () => target.removeEventListener(ORDER_EVENT, listener);
}
