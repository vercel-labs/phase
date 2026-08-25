import { useEffect, useRef } from 'react';

import { createDebounce, type Debounce } from '../../core/debounce';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DebouncedFunction<T = void> {
  (value: T): void;
  /** Invoke a pending call now. No-op when nothing is pending. */
  flush(): void;
  /** Discard a pending call. */
  cancel(): void;
}

export interface UseDebouncedCallbackOptions {
  /** Quiet period in milliseconds. Each call restarts it. */
  wait: number;
  /** Pending-call policy when the document hides. Default `'flush'`. */
  hidden?: 'flush' | 'drop';
}

// ---------------------------------------------------------------------------
// useDebouncedCallback
// ---------------------------------------------------------------------------

/**
 * Visibility-aware trailing debounce around `callback`. Returns a
 * stable-identity function that drops into any callback slot; the latest
 * `callback` is always invoked once `wait` ms pass without a new call.
 * Unmount and option changes discard a pending call; call `.flush()` first
 * when the final value matters.
 *
 * @example
 * const realloc = useDebouncedCallback(
 *   (size: Size) => resizeBuffers(size),
 *   { wait: 250 },
 * );
 * useSize({ ref, onResize: realloc });
 */
export function useDebouncedCallback<T = void>(
  callback: (value: T) => void,
  options: UseDebouncedCallbackOptions,
): DebouncedFunction<T> {
  const { wait, hidden } = options;
  const callbackRef = useSyncedRef(callback);
  const instanceRef = useRef<Debounce<T> | null>(null);

  // Stable callable created once; delegates to the current core instance.
  const debouncedRef = useRef<DebouncedFunction<T> | null>(null);
  if (debouncedRef.current === null) {
    const debounced = ((value: T) => {
      instanceRef.current?.call(value);
    }) as DebouncedFunction<T>;
    debounced.flush = () => instanceRef.current?.flush();
    debounced.cancel = () => instanceRef.current?.cancel();
    debouncedRef.current = debounced;
  }

  useEffect(() => {
    const instance = createDebounce<T>({
      callback: (value) => callbackRef.current(value),
      wait,
      hidden,
    });
    instanceRef.current = instance;

    return () => {
      instance.stop();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait, hidden]);

  return debouncedRef.current;
}
