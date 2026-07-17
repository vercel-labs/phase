import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createPointer,
  type PointerPhase,
  type PointerReason,
  type PointerState,
} from '../../core/pointer';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PointerCallback = (state: PointerState) => void;

export type PointerPhaseCallback = (
  phase: PointerPhase,
  reason: PointerReason,
) => void;

export interface UsePointerOptions<T extends Element = HTMLDivElement> {
  /** Element to track. When omitted, attach the returned `ref`. */
  ref?: RefObject<T | null>;
  /** Called once per rAF frame with the latest pointer position. */
  onPointer: PointerCallback;
  /**
   * Called on every phase transition. When provided, `phase` and `phaseReason`
   * stay at initial values and no re-renders occur (transient mode).
   */
  onPhaseChange?: PointerPhaseCallback;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** When `false`, tears down the tracker entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UsePointerReactiveResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: PointerPhase;
  phaseReason: PointerReason;
  phaseRef: RefObject<PointerPhase>;
  phaseReasonRef: RefObject<PointerReason>;
  /** Latest pointer position via ref. Always current, never triggers re-render. */
  stateRef: RefObject<PointerState>;
}

export interface UsePointerTransientResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phaseRef: RefObject<PointerPhase>;
  phaseReasonRef: RefObject<PointerReason>;
  /** Latest pointer position via ref. Always current, never triggers re-render. */
  stateRef: RefObject<PointerState>;
}

export type UsePointerResult<T extends Element = HTMLDivElement> =
  UsePointerReactiveResult<T>;

// ---------------------------------------------------------------------------
// usePointer
// ---------------------------------------------------------------------------

type PointerPhaseState = { phase: PointerPhase; phaseReason: PointerReason };

const INITIAL_STATE: PointerPhaseState = {
  phase: 'idle',
  phaseReason: 'initial',
};

/**
 * Lifecycle-aware pointer tracker with rAF-batched `getBoundingClientRect`.
 * Auto-pauses off-screen and tears down on unmount.
 *
 * Pass `onPhaseChange` for zero-re-render mode (transient). Without it,
 * `phase` and `phaseReason` update via state on every transition. The pointer
 * position is always delivered imperatively via `onPointer` (never state) and
 * mirrored in `stateRef` for on-demand reads (e.g. inside a `useLoop` tick).
 */
export function usePointer<T extends Element = HTMLDivElement>(
  options: UsePointerOptions<T> & { onPhaseChange: PointerPhaseCallback },
): UsePointerTransientResult<T>;
export function usePointer<T extends Element = HTMLDivElement>(
  options: UsePointerOptions<T>,
): UsePointerReactiveResult<T>;
export function usePointer<T extends Element = HTMLDivElement>(
  options: UsePointerOptions<T>,
): UsePointerReactiveResult<T> | UsePointerTransientResult<T> {
  const [state, setState] = useState<PointerPhaseState>(INITIAL_STATE);
  const { visibility = 'pause', enabled = true, intersectionOptions } = options;

  const phaseRef = useRef<PointerPhase>('idle');
  const phaseReasonRef = useRef<PointerReason>('initial');
  const stateRef = useRef<PointerState>({ x: 0, y: 0, active: false });
  const onPointerRef = useSyncedRef(options.onPointer);
  const onPhaseChangeRef = useSyncedRef(options.onPhaseChange);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      setState(INITIAL_STATE);
      phaseRef.current = 'idle';
      phaseReasonRef.current = 'initial';
      stateRef.current = { x: 0, y: 0, active: false };
      return;
    }

    const instance = createPointer({
      element,
      onPointer: (pointerState) => {
        stateRef.current = pointerState;
        onPointerRef.current(pointerState);
      },
      onPhaseChange: (phase, reason) => {
        phaseRef.current = phase;
        phaseReasonRef.current = reason;

        if (onPhaseChangeRef.current) {
          onPhaseChangeRef.current(phase, reason);
        } else {
          setState({ phase, phaseReason: reason });
        }
      },
      visibility,
      intersectionOptions,
    });

    return () => instance.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visibility]);

  return { ref, ...state, phaseRef, phaseReasonRef, stateRef };
}
