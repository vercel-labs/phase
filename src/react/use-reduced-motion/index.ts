import { REDUCED_MOTION_QUERY } from '../../core/reduced-motion';
import { useMediaQuery } from '../use-media';

/**
 * Reactive boolean that tracks the user's `prefers-reduced-motion` OS setting.
 *
 * Returns `false` during SSR and initial hydration, then the live value.
 * Re-renders only when the preference changes.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
