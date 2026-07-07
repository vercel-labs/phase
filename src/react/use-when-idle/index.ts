import { useEffect } from 'react';

import { whenIdle, type IdleOptions } from '../../core/idle';
import { useSyncedRef } from '../use-synced-ref';

export type { IdleOptions } from '../../core/idle';

/**
 * Run a callback once, when the browser is idle after mount. The effect-shaped
 * counterpart to `useIdle`. Use it for side effects (prefetching a chunk,
 * warming a cache, `import()`) rather than rendering.
 *
 * Cancels automatically on unmount, and always calls the latest `callback`
 * without re-subscribing. SSR-safe: nothing runs on the server.
 *
 * @example
 * // Prefetch a heavy panel during idle time so it opens instantly later.
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
