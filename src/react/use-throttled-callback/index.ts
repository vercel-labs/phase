import { useEffect, useRef } from 'react';

import {
  createThrottle,
  type Throttle,
  type ThrottleEdge,
} from '../../core/throttle';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ThrottledFunction<T = void> {
  (value: T): void;
  /** Invoke a pending trailing call now. No-op when nothing is pending. */
  flush(): void;
  /** Discard a pending trailing call and reset the interval window. */
  cancel(): void;
}

export interface UseThrottledCallbackOptions {
  /**
   * Minimum milliseconds between invocations. Trailing calls fire on the
   * first animation frame at or past the interval.
   */
  interval: number;
  /** Which edges fire. Default `'both'`. */
  edge?: ThrottleEdge;
  /** Pending-call policy when the document hides. Default `'flush'`. */
  hidden?: 'flush' | 'drop';
}

// ---------------------------------------------------------------------------
// useThrottledCallback
// ---------------------------------------------------------------------------

/**
 * Frame-aligned, visibility-aware throttle around `callback`. Returns a
 * stable-identity function that drops into any callback slot; the latest
 * `callback` is always invoked. Unmount and option changes discard a pending
 * trailing call; call `.flush()` first when the final value matters.
 *
 * @example
 * const emit = useThrottledCallback(
 *   (s: PointerState) => socket.emit('cursor', s.x, s.y),
 *   { interval: 50 },
 * );
 * const { ref } = usePointer({ onPointer: emit });
 */
export function useThrottledCallback<T = void>(
  callback: (value: T) => void,
  options: UseThrottledCallbackOptions,
): ThrottledFunction<T> {
  const { interval, edge, hidden } = options;
  const callbackRef = useSyncedRef(callback);
  const instanceRef = useRef<Throttle<T> | null>(null);

  // Stable callable created once; delegates to the current core instance.
  const throttledRef = useRef<ThrottledFunction<T> | null>(null);
  if (throttledRef.current === null) {
    const throttled = ((value: T) => {
      instanceRef.current?.call(value);
    }) as ThrottledFunction<T>;
    throttled.flush = () => instanceRef.current?.flush();
    throttled.cancel = () => instanceRef.current?.cancel();
    throttledRef.current = throttled;
  }

  useEffect(() => {
    const instance = createThrottle<T>({
      callback: (value) => callbackRef.current(value),
      interval,
      edge,
      hidden,
    });
    instanceRef.current = instance;

    return () => {
      instance.stop();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, edge, hidden]);

  return throttledRef.current;
}
