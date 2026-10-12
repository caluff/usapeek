export function createLiveReadQueue<T>({
  read,
  onData,
  onError,
  shouldRetry = () => true,
}: {
  read: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: (error: unknown) => void;
  shouldRetry?: (error: unknown) => boolean;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let isQueued = false;
  let isPaused = false;
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
        if (shouldRetry(error))
          retryDelay = Math.min(1_000 * 2 ** failures++, 30_000);
      }
    } finally {
      controller = undefined;
      if (isQueued) schedule(200);
      else if (retryDelay !== undefined) schedule(retryDelay);
    }
  }

  function pause() {
    isPaused = true;
    isQueued = false;
    clearTimeout(timer);
    timer = undefined;
    controller?.abort();
  }

  return {
    request() {
      if (isDisposed) return;
      isPaused = false;
      isQueued = true;
      schedule(200);
    },
    pause,
    dispose() {
      isDisposed = true;
      pause();
    },
  };
}
