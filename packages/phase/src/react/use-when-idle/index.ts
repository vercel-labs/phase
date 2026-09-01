import { useEffect } from 'react';

import { whenIdle, type IdleOptions } from '../../core/idle';
import { useSyncedRef } from '../use-synced-ref';

export type { IdleOptions } from '../../core/idle';

/**
 * Run a callback once after `requestIdleCallback` when available or in the
 * next task when it is not. The effect-shaped counterpart to `useIdle`. Use
 * it for non-critical side effects (prefetching a chunk, warming a cache,
 * `import()`) that can tolerate the fallback running before browser idle.
 *
 * Cancels automatically on unmount, and always calls the latest `callback`
 * without re-subscribing. SSR-safe: nothing runs on the server.
 *
 * @example
 * // Prefetch a heavy panel through idle scheduling.
 * useWhenIdle(() => void import('./chat-panel'));
 */
export function useWhenIdle(callback: () => void, options?: IdleOptions): void {
  const callbackRef = useSyncedRef(callback);
  const timeout = options?.timeout;

  useEffect(() => {
    const cancel: () => void = whenIdle(() => callbackRef.current(), {
      timeout,
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout]);
}
