export interface MockIdleResult {
  requestIdleCallback: typeof requestIdleCallback;
  cancelIdleCallback: typeof cancelIdleCallback;
  /** Number of scheduled callbacks not yet run or cancelled. */
  readonly pending: number;
  /** Run all pending idle callbacks (in scheduling order) and clear the queue. */
  flush: () => void;
}

/**
 * Controllable `requestIdleCallback` mock. jsdom does not implement idle
 * callbacks, so tests install this and call `flush()` to run them on demand.
 */
export function createMockIdle(): MockIdleResult {
  const callbacks = new Map<number, IdleRequestCallback>();
  let nextHandle = 1;

  function requestIdleCallbackMock(callback: IdleRequestCallback): number {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  }

  function cancelIdleCallbackMock(handle: number): void {
    callbacks.delete(handle);
  }

  function flush(): void {
    const pending = [...callbacks.entries()];
    callbacks.clear();
    for (const [, callback] of pending) {
      callback({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline);
    }
  }

  return {
    requestIdleCallback: requestIdleCallbackMock as typeof requestIdleCallback,
    cancelIdleCallback: cancelIdleCallbackMock as typeof cancelIdleCallback,
    get pending() {
      return callbacks.size;
    },
    flush,
  };
}
