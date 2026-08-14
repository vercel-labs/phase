import {
  readMediaQuery,
  subscribeMediaQuery,
} from '../_internal/pool/mql-pool';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Synchronous check for `prefers-reduced-motion: reduce`.
 *
 * Returns `false` on the server (no `matchMedia`). On the client, reads from
 * the shared MQL pool so the underlying `MediaQueryList` is reused across
 * all callers.
 */
export function prefersReducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return readMediaQuery(REDUCED_MOTION_QUERY);
}

export function subscribeReducedMotion(
  callback: (matches: boolean) => void,
): () => void {
  if (typeof matchMedia === 'undefined') return noop;
  return subscribeMediaQuery(REDUCED_MOTION_QUERY, callback);
}

function noop(): void {
  return undefined;
}
