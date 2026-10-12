export function createSettlementRefreshQueue(refresh: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isRefreshing = false;
  let isQueued = false;
  let isDisposed = false;

  function request() {
    if (isDisposed) return;
    isQueued = true;
    if (isRefreshing || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      isQueued = false;
      isRefreshing = true;
      refresh();
    }, 200);
  }

  function cancelPending() {
    clearTimeout(timer);
    timer = undefined;
    isQueued = false;
  }

  return {
    request,
    settled() {
      isRefreshing = false;
      if (isQueued) request();
    },
    cancelPending,
    dispose() {
      isDisposed = true;
      cancelPending();
    },
  };
}
