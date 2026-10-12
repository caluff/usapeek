export function createCatalogRefreshQueue(refresh: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isRefreshing = false;
  let isQueued = false;
  let isBlocked = false;
  let isDisposed = false;

  function schedule() {
    if (isDisposed || isBlocked || isRefreshing || timer || !isQueued) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (isDisposed || isBlocked) return;
      isQueued = false;
      isRefreshing = true;
      refresh();
    }, 200);
  }

  return {
    request() {
      if (isDisposed) return;
      isQueued = true;
      schedule();
    },
    settled() {
      isRefreshing = false;
      schedule();
    },
    setBlocked(blocked: boolean) {
      isBlocked = blocked;
      if (blocked) {
        clearTimeout(timer);
        timer = undefined;
      } else schedule();
    },
    dispose() {
      isDisposed = true;
      isQueued = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
