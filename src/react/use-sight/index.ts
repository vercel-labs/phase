import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createSight,
  type SightPhase,
  type SightReason,
} from '../../core/sight';

export interface UseSightOptions<
  T extends Element = HTMLDivElement,
> extends IntersectionObserverInit {
  /**
   * Element to observe. Optional — when omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
  /** `'continuous'` keeps observing. `'once'` freezes at `'visible'` after first intersection. */
  observe?: 'continuous' | 'once';
}

export interface UseSightResult<T extends Element = HTMLDivElement> {
  /** Attach to the element whose visibility you want to track. */
  ref: RefObject<T | null>;
  phase: SightPhase;
  phaseReason: SightReason;
}

type SightState = Omit<UseSightResult, 'ref'>;

const INITIAL_STATE: SightState = {
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
 * const { ref, phase } = useSight();
 * if (phase === 'visible') startAnimation();
 * return <div ref={ref} />;
 */
export function useSight<T extends Element = HTMLDivElement>(
  options?: UseSightOptions<T>,
): UseSightResult<T> {
  const [state, setState] = useState<SightState>(INITIAL_STATE);
  const observe = options?.observe ?? 'continuous';

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    let frozen = false;

    const sight = createSight({
      element,
      intersectionOptions: {
        root: options?.root,
        rootMargin: options?.rootMargin,
        threshold: options?.threshold,
      },
      onPhaseChange: (phase, reason) => {
        if (frozen) return;
        setState({ phase, phaseReason: reason });

        if (observe === 'once' && phase === 'visible') {
          frozen = true;
          sight.stop();
        }
      },
    });

    return () => sight.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observe]);

  return { ref, ...state };
}
