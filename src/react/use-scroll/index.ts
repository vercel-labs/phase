import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from 'react';

import {
  createScroll,
  type Scroll,
  type ScrollPhase,
  type ScrollReason,
  type ScrollState,
} from '../../core/scroll';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScrollCallback = (state: ScrollState) => void;

export interface UseScrollOptions<T extends Element = HTMLDivElement> {
  /** Element to track. When omitted, attach the returned `ref`. */
  ref?: RefObject<T | null>;
  /** Called once per rAF frame with the latest scroll position + progress. */
  onScroll: ScrollCallback;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** When `false`, tears down the tracker entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UseScrollResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: ScrollPhase;
  phaseReason: ScrollReason;
  /** Phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<ScrollPhase>;
  /** Reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<ScrollReason>;
  /** Latest scroll state via ref. Always current, never triggers re-render. */
  stateRef: RefObject<ScrollState>;
  /** Re-read geometry after a content change (e.g. after navigation). */
  measure: () => void;
}

// ---------------------------------------------------------------------------
// useScroll
// ---------------------------------------------------------------------------

type ScrollPhaseState = { phase: ScrollPhase; phaseReason: ScrollReason };

const INITIAL_STATE: ScrollPhaseState = {
  phase: 'paused',
  phaseReason: 'initial',
};

function initialState(): ScrollState {
  return {
    x: 0,
    y: 0,
    maxX: 0,
    maxY: 0,
    progressX: 0,
    progressY: 0,
    visibleX: 1,
    visibleY: 1,
  };
}

/**
 * Lifecycle-aware scroll tracker. Scroll position is delivered imperatively via
 * `onScroll` (never state) and mirrored in `stateRef` for on-demand reads; only
 * the phase (tracking/paused) is reactive, since it flips rarely. This mirrors
 * `usePointer`. Auto-pauses off-screen and tears down on unmount.
 *
 * Reads `scrollLeft`/`scrollTop` once per rAF frame; the reflow-heavy geometry
 * (`scrollWidth`/`clientWidth`) is read only on resize or via `measure()`, never
 * on the scroll path. Call `measure()` after mutating scrollable content.
 */
export function useScroll<T extends Element = HTMLDivElement>(
  options: UseScrollOptions<T>,
): UseScrollResult<T> {
  const [state, setState] = useState<ScrollPhaseState>(INITIAL_STATE);
  const { visibility = 'pause', enabled = true, intersectionOptions } = options;

  const phaseRef = useRef<ScrollPhase>('paused');
  const phaseReasonRef = useRef<ScrollReason>('initial');
  const stateRef = useRef<ScrollState>(initialState());
  const onScrollRef = useSyncedRef(options.onScroll);
  const instanceRef = useRef<Scroll | null>(null);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;

  const measure = useCallback(() => {
    instanceRef.current?.measure();
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      instanceRef.current = null;
      setState(INITIAL_STATE);
      phaseRef.current = 'paused';
      phaseReasonRef.current = 'initial';
      stateRef.current = initialState();
      return;
    }

    const instance = createScroll({
      element,
      onScroll: (scrollState) => {
        stateRef.current = scrollState;
        onScrollRef.current(scrollState);
      },
      onPhaseChange: (phase, reason) => {
        phaseRef.current = phase;
        phaseReasonRef.current = reason;
        setState({ phase, phaseReason: reason });
      },
      visibility,
      intersectionOptions,
    });
    instanceRef.current = instance;

    return () => {
      instance.stop();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visibility]);

  return { ref, ...state, phaseRef, phaseReasonRef, stateRef, measure };
}
