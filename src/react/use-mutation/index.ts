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

export interface UseMutationOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to observe. When omitted, attach the returned `ref`.
   * Must be set before the first effect commit (standard React ref contract).
   */
  ref?: RefObject<T | null>;
  /**
   * Standard MutationObserver configuration. Read once at subscribe time and
   * kept out of the effect deps, so a static config can be inline (it never
   * re-subscribes the observer). Runtime changes are not tracked; toggle
   * `enabled` to re-observe with a new config.
   */
  mutation: MutationObserverInit;
  /** Called once per rAF frame with coalesced records. Never per-record. */
  onMutations: MutationRecordsCallback;
  /** Pause when off-screen or ignore visibility. Default `'pause'`. */
  visibility?: 'pause' | 'ignore';
  /** When `false`, tears down the observer entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UseMutationResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: MutationPhase;
  phaseReason: MutationReason;
  /** Phase via ref. Always current, never triggers re-render. */
  phaseRef: RefObject<MutationPhase>;
  /** Reason via ref. Always current, never triggers re-render. */
  phaseReasonRef: RefObject<MutationReason>;
}

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
 * Records are always delivered imperatively via `onMutations` (never state).
 * Phase transitions (observing/paused) are infrequent, so `phase`/`phaseReason`
 * are reactive state; read `phaseRef`/`phaseReasonRef` for the latest value
 * inside `onMutations` without closure staleness. For synchronous phase
 * reactions, use the core `createMutation` primitive.
 */
export function useMutation<T extends Element = HTMLDivElement>(
  options: UseMutationOptions<T>,
): UseMutationResult<T> {
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
      target: element,
      mutation: mutationInit,
      onMutations: (records) => onMutationsRef.current(records),
      onPhaseChange: (phase, reason) => {
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

  return { ref, ...state, phaseRef, phaseReasonRef };
}
