import { linkAbortSignal } from '../_internal/abort';
import { serverContextError } from '../_internal/errors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DebounceOptions<T = void> {
  /** Called with the latest value passed to `call`. */
  callback: (value: T) => void;
  /** Quiet period in milliseconds. Each call restarts it. */
  wait: number;
  /** Pending-call policy when the document hides. Default `'flush'`. */
  hidden?: 'flush' | 'drop';
  /** Stops the debounce when aborted. */
  signal?: AbortSignal;
}

export interface Debounce<T = void> {
  /** Record `value` and restart the quiet timer. */
  call(value: T): void;
  /** Invoke a pending call now. No-op when nothing is pending. */
  flush(): void;
  /** Discard a pending call. */
  cancel(): void;
  /** Whether a call is waiting for the quiet period to elapse. */
  readonly pending: boolean;
  /** Terminal. Discards pending work and removes listeners. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// createDebounce
// ---------------------------------------------------------------------------

/**
 * Visibility-aware trailing debounce. Fires the callback with the latest
 * value once `wait` milliseconds pass without a new call. While the document
 * is hidden no timer runs: a pending call is flushed or dropped per `hidden`,
 * and new calls are recorded but wait until the document is visible again,
 * when the quiet timer restarts.
 */
export function createDebounce<T = void>(
  options: DebounceOptions<T>,
): Debounce<T> {
  if (typeof document === 'undefined') {
    serverContextError('createDebounce');
  }

  const { callback, wait, hidden = 'flush', signal } = options;

  let stopped = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let documentVisible: boolean = !document.hidden;
  let latest: T = undefined as T;

  function fire(): void {
    pending = false;
    callback(latest);
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function onTimer(): void {
    timer = undefined;
    if (stopped || !pending) return;
    fire();
  }

  function startTimer(): void {
    clearTimer();
    timer = setTimeout(onTimer, wait);
  }

  function call(value: T): void {
    if (stopped) return;
    latest = value;
    pending = true;
    // Hidden: record only. The quiet timer restarts on visibility.
    if (documentVisible) startTimer();
  }

  function flush(): void {
    if (stopped || !pending) return;
    clearTimer();
    fire();
  }

  function cancel(): void {
    if (stopped) return;
    clearTimer();
    pending = false;
  }

  function onVisibilityChange(): void {
    documentVisible = !document.hidden;
    if (stopped) return;
    if (!documentVisible) {
      clearTimer();
      if (pending) {
        if (hidden === 'flush') fire();
        else pending = false;
      }
    } else if (pending) {
      startTimer();
    }
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    documentVisible = true;
    if (!stopped && pending) startTimer();
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
    clearTimer();
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
