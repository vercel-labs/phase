import { useState, useEffect } from 'react';

import { whenIdle, type IdleOptions } from '../../core/idle';

export type { IdleOptions } from '../../core/idle';

/**
 * Returns `false`, then `true` once the browser is idle after mount. Use it to
 * defer non-critical work or mounting until the main thread is free.
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
