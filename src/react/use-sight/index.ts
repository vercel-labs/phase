import { useState, useEffect, type RefObject } from 'react';

import {
  createSight,
  type SightPhase,
  type SightReason,
} from '../../core/sight/index.js';

export interface UseSightOptions extends IntersectionObserverInit {
  /** `'continuous'` keeps observing. `'once'` freezes at `'visible'` after first intersection. */
  observe?: 'continuous' | 'once';
}

export interface UseSightResult {
  phase: SightPhase;
  phaseReason: SightReason;
}

const INITIAL_STATE: UseSightResult = {
  phase: 'unknown',
  phaseReason: 'initial',
};

/**
 * Intersection + document visibility as a phase.
 *
 * Returns `'unknown'` during SSR and before first observation.
 * `observe: 'once'` freezes at `'visible'` after first intersection and unobserves.
 *
 * @example
 * const { phase } = useSight(ref);
 * if (phase === 'visible') startAnimation();
 */
export function useSight(
  ref: RefObject<Element | null>,
  options?: UseSightOptions,
): UseSightResult {
  const [state, setState] = useState<UseSightResult>(INITIAL_STATE);
  const observe = options?.observe ?? 'continuous';

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    let frozen = false;

    const sight = createSight({
      element,
      intersectionOptions: options,
      onPhaseChange: (phase, reason) => {
        if (frozen) return;
        setState({ phase, phaseReason: reason });

        if (observe === 'once' && phase === 'visible') {
          frozen = true;
          sight.dispose();
        }
      },
    });

    return () => sight.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observe]);

  return state;
}
