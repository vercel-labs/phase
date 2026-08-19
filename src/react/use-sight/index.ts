import { useState, useEffect, useRef, type RefObject } from 'react';

import { conflictingTargetError } from '../../core/_internal/errors';
import {
  createSight,
  type Sight,
  type SightPhase,
  type SightReason,
} from '../../core/sight';
import { useSyncedRef } from '../use-synced-ref';

export type SightCallback = (
  phase: SightPhase,
  phaseReason: SightReason,
) => void;

export interface UseSightOptions<
  T extends Element = HTMLDivElement,
> extends IntersectionObserverInit {
  /**
   * Element to observe. Optional. When omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
  /**
   * Anchor to the page instead of an element. Pass `'page'`. Mutually
   * exclusive with `ref`.
   *
   * This is a string rather than `document` because hook options are built
   * during render, and render runs on the server for a client component. A
   * literal `document` there throws before the hook is called.
   */
  target?: 'page';
  /** `'continuous'` keeps observing. `'once'` freezes at `'visible'` after first intersection. */
  observe?: 'continuous' | 'once';
  /**
   * Called on every visibility transition. When provided, `phase` and
   * `phaseReason` stay at initial values and no re-renders occur.
   */
  onVisibilityChange?: SightCallback;
}

export interface UseSightReactiveResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: SightPhase;
  phaseReason: SightReason;
  /** Visibility phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<SightPhase>;
  /** Phase reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<SightReason>;
}

export interface UseSightTransientResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  /** Visibility phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<SightPhase>;
  /** Phase reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<SightReason>;
}

/** @deprecated Use `UseSightReactiveResult` or `UseSightTransientResult`. */
export type UseSightResult<T extends Element = HTMLDivElement> =
  UseSightReactiveResult<T>;

type SightState = { phase: SightPhase; phaseReason: SightReason };

const INITIAL_STATE: SightState = {
  phase: 'unknown',
  phaseReason: 'initial',
};

/**
 * Intersection + document visibility as a phase.
 *
 * Pass `onVisibilityChange` for zero-re-render mode (animation gating,
 * many-element observation). Without it, `phase` and `phaseReason` update
 * via state on every transition. `phaseRef`/`phaseReasonRef` are always current.
 *
 * @example
 * // Reactive
 * const { ref, phase } = useSight();
 *
 * // Transient (no re-renders)
 * const { ref, phaseRef } = useSight({
 *   onVisibilityChange: (phase) => { worker.postMessage({ visible: phase === 'visible' }); },
 * });
 */
export function useSight<T extends Element = HTMLDivElement>(
  options: UseSightOptions<T> & { onVisibilityChange: SightCallback },
): UseSightTransientResult<T>;
export function useSight<T extends Element = HTMLDivElement>(
  options?: UseSightOptions<T>,
): UseSightReactiveResult<T>;
export function useSight<T extends Element = HTMLDivElement>(
  options?: UseSightOptions<T>,
): UseSightReactiveResult<T> | UseSightTransientResult<T> {
  const [state, setState] = useState<SightState>(INITIAL_STATE);
  const observe = options?.observe ?? 'continuous';
  const phaseRef = useRef<SightPhase>('unknown');
  const phaseReasonRef = useRef<SightReason>('initial');
  const onVisibilityChangeRef = useSyncedRef(options?.onVisibilityChange);

  const target = options?.target;
  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  useEffect(() => {
    if (target && options?.ref) conflictingTargetError('useSight');

    // Resolved here, not in the options object: this runs only on the client.
    const anchor: Element | Document | null =
      target === 'page' ? document : ref.current;
    if (!anchor) return;

    let frozen = false;
    // A page target reports its phase synchronously from createSight, before
    // `sight` is bound, so the freeze is applied after construction instead.
    let instance: Sight | null = null;

    const sight = createSight({
      target: anchor,
      intersectionOptions: {
        root: options?.root,
        rootMargin: options?.rootMargin,
        threshold: options?.threshold,
      },
      onPhaseChange: (phase, reason) => {
        if (frozen) return;

        phaseRef.current = phase;
        phaseReasonRef.current = reason;

        if (onVisibilityChangeRef.current) {
          onVisibilityChangeRef.current(phase, reason);
        } else {
          setState({ phase, phaseReason: reason });
        }

        if (observe === 'once' && phase === 'visible') {
          frozen = true;
          instance?.stop();
        }
      },
    });

    instance = sight;
    if (frozen) sight.stop();

    return () => sight.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observe, target]);

  return { ref, ...state, phaseRef, phaseReasonRef };
}
