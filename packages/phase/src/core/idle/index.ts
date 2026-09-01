import { linkAbortSignal } from '../_internal/abort';
import { serverContextError } from '../_internal/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IdleOptions {
  /** Max ms to wait before running the callback even if no idle period occurs. */
  timeout?: number;
  /** Abort signal that cancels the scheduled callback when aborted. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback delay when `requestIdleCallback` is unavailable (e.g. Safari). */
const FALLBACK_DELAY = 1;

// ---------------------------------------------------------------------------
// whenIdle
// ---------------------------------------------------------------------------

/**
 * Run a callback through `requestIdleCallback`, falling back to a near-immediate
 * `setTimeout` where it is unavailable (Safari). The fallback does not wait for
 * browser idle.
 *
 * Returns a cancel function. Calling it before the callback runs prevents it.
 *
 * @example
 * const cancel = whenIdle(() => warmCache(), { timeout: 2000 });
 * // later, if no longer needed:
 * cancel();
 */
export function whenIdle(
  callback: () => void,
  options?: IdleOptions,
): () => void {
  if (typeof window === 'undefined') {
    serverContextError('whenIdle');
  }

  const { timeout, signal } = options ?? {};

  // Already aborted: never schedule, and hand back a no-op cancel.
  if (signal?.aborted) {
    return () => {
      // Nothing was scheduled, so there is nothing to cancel.
    };
  }

  let cancel: () => void;

  if (typeof window.requestIdleCallback === 'function') {
    // Capture cancelIdleCallback now (bound to window), rather than reading
    // window.cancelIdleCallback inside the returned closure. The cancel may run
    // after the global is swapped out (e.g. test teardown unstubbing globals),
    // and a late lookup would throw "not a function". Binding also avoids an
    // illegal-invocation error from calling it detached from window.
    const cancelIdle = window.cancelIdleCallback.bind(window);
    const handle: number = window.requestIdleCallback(
      () => callback(),
      timeout === undefined ? undefined : { timeout },
    );
    cancel = () => cancelIdle(handle);
  } else {
    const handle: ReturnType<typeof setTimeout> = setTimeout(
      callback,
      FALLBACK_DELAY,
    );
    cancel = () => clearTimeout(handle);
  }

  const unlinkAbort: () => void = linkAbortSignal(signal, cancel);

  return () => {
    unlinkAbort();
    cancel();
  };
}
