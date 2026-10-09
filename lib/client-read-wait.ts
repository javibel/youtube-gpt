// End a local read even when the transport ignores abort. This does not prove
// that a request stopped at the server, or authorize any retry or mutation.
export function createClientReadWait() {
  const controller = new AbortController();
  let rejectStop!: (reason: Error) => void;
  let finished = false;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const cancel = () => {
    if (finished) return;
    controller.abort();
    clearTimeout(timer);
    rejectStop(new Error('Client read ended'));
  };
  const timer = setTimeout(cancel, 30_000);
  return {
    signal: controller.signal,
    cancel,
    async wait<T>(pending: Promise<T>): Promise<T> {
      const value = await Promise.race([pending, stopped]);
      if (controller.signal.aborted) throw new Error('Client read ended');
      return value;
    },
    finish() { finished = true; clearTimeout(timer); }
  };
}
