import { linkAbortSignal } from '../_internal/abort';
import { serverContextError } from '../_internal/errors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ThrottleEdge = 'leading' | 'trailing' | 'both';

export interface ThrottleOptions<T = void> {
  /** Called with the latest value passed to `call`. */
  callback: (value: T) => void;
  /**
   * Minimum milliseconds between invocations. Trailing calls fire on the
   * first animation frame at or past the interval, so the effective interval
   * quantizes up to frame boundaries.
   */
  interval: number;
  /** Which edges fire. Default `'both'`. */
  edge?: ThrottleEdge;
  /** Pending-call policy when the document hides. Default `'flush'`. */
  hidden?: 'flush' | 'drop';
  /** Stops the throttle when aborted. */
  signal?: AbortSignal;
}

export interface Throttle<T = void> {
  /** Record `value` and fire per the edge rules. */
  call(value: T): void;
  /** Invoke a pending trailing call now. No-op when nothing is pending. */
  flush(): void;
  /** Discard a pending trailing call and reset the interval window. */
  cancel(): void;
  /** Whether a trailing call is waiting to fire. */
  readonly pending: boolean;
  /** Terminal. Discards pending work and removes listeners. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// createThrottle
// ---------------------------------------------------------------------------

/**
 * Frame-aligned, visibility-aware throttle. Leading calls fire synchronously;
 * a pending trailing call rides a one-shot rAF chain and fires with the latest
 * value on the first frame at or past `interval`. While the document is hidden
 * nothing is scheduled: a pending call is flushed or dropped per `hidden`, and
 * new calls are recorded but deferred until the document is visible again.
 *
 * @remarks
 * `call` takes exactly one value and stores it by reference, so the hot path
 * never allocates. Trailing calls read the value at fire time.
 */
export function createThrottle<T = void>(
  options: ThrottleOptions<T>,
): Throttle<T> {
  if (typeof document === 'undefined') {
    serverContextError('createThrottle');
  }

  const {
    callback,
    interval,
    edge = 'both',
    hidden = 'flush',
    signal,
  } = options;
  const leading: boolean = edge !== 'trailing';
  const trailing: boolean = edge !== 'leading';

  let stopped = false;
  let pending = false;
  let lastFire = 0;
  let rafId = 0;
  let documentVisible: boolean = !document.hidden;
  let latest: T = undefined as T;

  function fire(now: number): void {
    lastFire = now;
    pending = false;
    callback(latest);
  }

  function cancelRaf(): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function tick(): void {
    rafId = 0;
    if (stopped || !pending) return;
    const now: number = performance.now();
    if (now - lastFire >= interval) {
      fire(now);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  }

  function scheduleRaf(): void {
    if (rafId === 0) rafId = requestAnimationFrame(tick);
  }

  function call(value: T): void {
    if (stopped) return;
    latest = value;

    // Hidden: record only. Everything defers until the document is visible.
    if (!documentVisible) {
      pending = true;
      return;
    }

    const now: number = performance.now();
    if (now - lastFire >= interval) {
      if (leading) {
        fire(now);
        return;
      }
      // Trailing-only: open the window without firing; the trailing call
      // lands at lastFire + interval.
      lastFire = now;
    }

    if (trailing) {
      pending = true;
      scheduleRaf();
    }
  }

  function flush(): void {
    if (stopped || !pending) return;
    cancelRaf();
    fire(performance.now());
  }

  function cancel(): void {
    if (stopped) return;
    cancelRaf();
    pending = false;
    lastFire = 0;
  }

  function onVisibilityChange(): void {
    documentVisible = !document.hidden;
    if (stopped) return;
    if (!documentVisible) {
      cancelRaf();
      if (pending) {
        if (hidden === 'flush') fire(performance.now());
        else pending = false;
      }
    } else if (pending) {
      scheduleRaf();
    }
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    documentVisible = true;
    if (!stopped && pending) scheduleRaf();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);

  let unlinkAbort: (() => void) | undefined;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    unlinkAbort?.();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    cancelRaf();
    pending = false;
  }

  unlinkAbort = linkAbortSignal(signal, stop);

  return {
    call,
    flush,
    cancel,
    get pending() {
      return pending;
    },
    stop,
  };
}
