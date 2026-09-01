import { useState, useEffect } from 'react';

import { whenIdle, type IdleOptions } from '../../core/idle';

export type { IdleOptions } from '../../core/idle';

/**
 * Returns `false`, then `true` after `requestIdleCallback` when available or
 * in the next task when it is not. Use only for non-critical work that can
 * tolerate the fallback running before the browser is idle.
 *
 * SSR-safe: returns `false` on the server and during the first client render.
 *
 * @example
 * const idle = useIdle();
 * return idle ? <Analytics /> : null;
 */
export function useIdle(options?: IdleOptions): boolean {
  const [idle, setIdle] = useState(false);
  const timeout = options?.timeout;

  useEffect(() => {
    const cancel: () => void = whenIdle(() => setIdle(true), { timeout });
    return cancel;
  }, [timeout]);

  return idle;
}
