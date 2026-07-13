import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createMutation,
  type MutationPhase,
  type MutationReason,
} from '../../core/mutation';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MutationRecordsCallback = (records: MutationRecord[]) => void;

export type MutationPhaseCallback = (
  phase: MutationPhase,
  phaseReason: MutationReason,
) => void;

export interface UseMutationOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to observe. When omitted, attach the returned `ref`.
   * Must be set before the first effect commit (standard React ref contract).
   */
  ref?: RefObject<T | null>;
  /**
   * Standard MutationObserver configuration. Must be stable across renders
   * (define outside the component or memoize). Changes are not tracked.
   */
  mutation: MutationObserverInit;
  /** Called once per rAF frame with coalesced records. Never per-record. */
  onMutations: MutationRecordsCallback;
  /**
   * Called on every phase transition. When provided, `phase` and `phaseReason`
   * stay at initial values and no re-renders occur (transient mode).
   */
  onPhaseChange?: MutationPhaseCallback;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** When `false`, tears down the observer entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UseMutationReactiveResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: MutationPhase;
  phaseReason: MutationReason;
  /** Phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<MutationPhase>;
  /** Reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<MutationReason>;
}

export interface UseMutationTransientResult<
  T extends Element = HTMLDivElement,
> {
  ref: RefObject<T | null>;
  /** Phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<MutationPhase>;
  /** Reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<MutationReason>;
}

export type UseMutationResult<T extends Element = HTMLDivElement> =
  UseMutationReactiveResult<T>;

// ---------------------------------------------------------------------------
// useMutation
// ---------------------------------------------------------------------------

type MutationState = { phase: MutationPhase; phaseReason: MutationReason };

const INITIAL_STATE: MutationState = {
  phase: 'paused',
  phaseReason: 'initial',
};

/**
 * Lifecycle-aware MutationObserver with rAF-coalesced callbacks.
 * Auto-pauses off-screen and tears down on unmount.
 *
 * Pass `onPhaseChange` for zero-re-render mode (transient). Without it,
 * `phase` and `phaseReason` update via state on every transition.
 */
export function useMutation<T extends Element = HTMLDivElement>(
  options: UseMutationOptions<T> & { onPhaseChange: MutationPhaseCallback },
): UseMutationTransientResult<T>;
export function useMutation<T extends Element = HTMLDivElement>(
  options: UseMutationOptions<T>,
): UseMutationReactiveResult<T>;
export function useMutation<T extends Element = HTMLDivElement>(
  options: UseMutationOptions<T>,
): UseMutationReactiveResult<T> | UseMutationTransientResult<T> {
  const [state, setState] = useState<MutationState>(INITIAL_STATE);
  const {
    mutation: mutationInit,
    visibility = 'pause',
    enabled = true,
    intersectionOptions,
  } = options;

  const phaseRef = useRef<MutationPhase>('paused');
  const phaseReasonRef = useRef<MutationReason>('initial');
  const onMutationsRef = useSyncedRef(options.onMutations);
  const onPhaseChangeRef = useSyncedRef(options.onPhaseChange);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      setState(INITIAL_STATE);
      phaseRef.current = 'paused';
      phaseReasonRef.current = 'initial';
      return;
    }

    const instance = createMutation({
      element,
      mutation: mutationInit,
      onMutations: (records) => onMutationsRef.current(records),
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

  return { ref, ...state, phaseRef, phaseReasonRef };
}
