type TraversalEvent = Event & {
  navigationType?: string;
  hashChange?: boolean;
  destination?: { key?: string; sameDocument?: boolean };
};

export type TraversalNavigation = EventTarget & {
  traverseTo: (key: string) => {
    committed: Promise<unknown>;
    finished: Promise<unknown>;
  };
};

export function browserTraversalNavigation(): TraversalNavigation | undefined {
  const navigation = (window as Window & { navigation?: TraversalNavigation })
    .navigation;
  return navigation && typeof navigation.traverseTo === "function"
    ? navigation
    : undefined;
}

export function guardUnsavedTraversals(
  navigation: TraversalNavigation,
  {
    isDirty,
    confirmDiscard,
    onError,
  }: {
    isDirty: () => boolean;
    confirmDiscard: (resume: () => void) => void;
    onError: () => void;
  },
) {
  let bypassKey: string | null = null;
  let isDisposed = false;
  function onNavigate(rawEvent: Event) {
    const event = rawEvent as TraversalEvent;
    const key = event.destination?.key;
    if (key && key === bypassKey) {
      bypassKey = null;
      return;
    }
    if (
      event.navigationType !== "traverse" ||
      !event.cancelable ||
      event.defaultPrevented ||
      !event.destination?.sameDocument ||
      !key ||
      event.hashChange ||
      !isDirty()
    )
      return;
    event.preventDefault();
    confirmDiscard(() => {
      if (isDisposed) return;
      bypassKey = key;
      try {
        const result = navigation.traverseTo(key);
        // Both promises can reject if the history entry disappeared meanwhile.
        void result.committed.catch(() => {});
        void result.finished.then(
          () => {
            if (bypassKey === key) bypassKey = null;
          },
          (error: unknown) => {
            if (bypassKey === key) bypassKey = null;
            if (
              !isDisposed &&
              !(error instanceof DOMException && error.name === "AbortError")
            )
              onError();
          },
        );
      } catch {
        bypassKey = null;
        onError();
      }
    });
  }
  navigation.addEventListener("navigate", onNavigate);
  return () => {
    isDisposed = true;
    navigation.removeEventListener("navigate", onNavigate);
  };
}
