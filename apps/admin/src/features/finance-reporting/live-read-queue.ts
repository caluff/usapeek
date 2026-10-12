export function createFinanceReadQueue<T>({
  read,
  onData,
  onError,
  shouldRetry = () => true,
  retryDelayMs = (failures: number) => Math.min(1_000 * 2 ** failures, 30_000),
}: {
  read: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: (error: unknown) => void;
  shouldRetry?: (error: unknown) => boolean;
  retryDelayMs?: (failures: number) => number;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let isQueued = false;
  let isPaused = true;
  let isDisposed = false;
  let failures = 0;

  function schedule(delay: number) {
    if (isDisposed || isPaused || controller || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  }

  async function run() {
    if (isDisposed || isPaused || controller) return;
    isQueued = false;
    const current = new AbortController();
    controller = current;
    let retryDelay: number | undefined;
    try {
      const data = await read(current.signal);
      if (!isDisposed && !current.signal.aborted) {
        failures = 0;
        onData(data);
      }
    } catch (error) {
      if (!isDisposed && !current.signal.aborted) {
        onError(error);
        if (shouldRetry(error)) retryDelay = retryDelayMs(failures++);
        else isQueued = false;
      }
    } finally {
      controller = undefined;
      if (retryDelay !== undefined) schedule(retryDelay);
      else if (isQueued) schedule(200);
    }
  }

  return {
    request() {
      if (isDisposed) return;
      isQueued = true;
      schedule(200);
    },
    setPaused(paused: boolean, { requestOnResume = true } = {}) {
      isPaused = paused;
      if (paused) {
        clearTimeout(timer);
        timer = undefined;
        controller?.abort();
      } else {
        if (requestOnResume) isQueued = true;
        if (!isQueued) return;
        schedule(200);
      }
    },
    dispose() {
      isDisposed = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
