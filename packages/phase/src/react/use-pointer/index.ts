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

export interface UsePointerOptions<T extends Element = HTMLDivElement> {
  /** Element to track. When omitted, attach the returned `ref`. */
  ref?: RefObject<T | null>;
  /** Called once per rAF frame with the latest pointer position. */
  onPointer: PointerCallback;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** When `false`, tears down the tracker entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UsePointerResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: PointerPhase;
  phaseReason: PointerReason;
  /** Phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<PointerPhase>;
  /** Reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<PointerReason>;
  /** Latest pointer position via ref. Always current, never triggers re-render. */
  stateRef: RefObject<PointerState>;
}

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
 * Position is always delivered imperatively via `onPointer` (never state) and
 * mirrored in `stateRef` for on-demand reads (e.g. inside a `useLoop` tick).
 * Phase transitions (tracking/idle) are infrequent, so `phase`/`phaseReason`
 * are reactive state; read `phaseRef`/`phaseReasonRef` for the latest value
 * without closure staleness. For synchronous phase reactions, use the core
 * `createPointer` primitive.
 */
export function usePointer<T extends Element = HTMLDivElement>(
  options: UsePointerOptions<T>,
): UsePointerResult<T> {
  const [state, setState] = useState<PointerPhaseState>(INITIAL_STATE);
  const { visibility = 'pause', enabled = true, intersectionOptions } = options;

  const phaseRef = useRef<PointerPhase>('idle');
  const phaseReasonRef = useRef<PointerReason>('initial');
  const stateRef = useRef<PointerState>({ x: 0, y: 0, active: false });
  const onPointerRef = useSyncedRef(options.onPointer);

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
      target: element,
      onPointer: (pointerState) => {
        stateRef.current = pointerState;
        onPointerRef.current(pointerState);
      },
      onPhaseChange: (phase, reason) => {
        stateRef.current.active = phase === 'tracking';
        phaseRef.current = phase;
        phaseReasonRef.current = reason;
        setState({ phase, phaseReason: reason });
      },
      visibility,
      intersectionOptions,
    });

    return () => instance.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visibility]);

  return { ref, ...state, phaseRef, phaseReasonRef, stateRef };
}
