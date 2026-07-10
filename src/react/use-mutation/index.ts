import { useEffect, useRef, type RefObject } from 'react';

import {
  createMutation,
  type MutationPhase,
  type MutationReason,
} from '../../core/mutation';
import { useSyncedRef } from '../use-synced-ref';

export type MutationCallback = (records: MutationRecord[]) => void;

export interface UseMutationOptions<T extends Element = HTMLDivElement> {
  /** Element to observe. When omitted, attach the returned `ref`. */
  ref?: RefObject<T | null>;
  /** MutationObserver configuration. */
  mutation: MutationObserverInit;
  /**
   * Called once per rAF frame with all coalesced records since the last frame.
   * Never called synchronously per-record.
   */
  onMutations: MutationCallback;
  /** Pause observation while the element is off-screen. Default `true`. */
  visibilityAware?: boolean;
  /** Tear down the observer entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UseMutationResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: MutationPhase;
  phaseReason: MutationReason;
}

/**
 * Lifecycle-aware MutationObserver with rAF-coalesced callbacks.
 *
 * Wraps `createMutation` with React lifecycle management. The observer
 * auto-pauses when the element is off-screen and tears down on unmount.
 * `onMutations` is synced via ref so its identity never restarts the observer.
 *
 * @example
 * const { ref } = useMutation({
 *   mutation: { childList: true },
 *   onMutations: (records) => applyChanges(records),
 * });
 * return <div ref={ref}>...</div>;
 */
export function useMutation<T extends Element = HTMLDivElement>(
  options: UseMutationOptions<T>,
): UseMutationResult<T> {
  const {
    mutation: mutationInit,
    visibilityAware = true,
    enabled = true,
    intersectionOptions,
  } = options;

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;
  const onMutationsRef = useSyncedRef(options.onMutations);
  const phaseRef = useRef<MutationPhase>('paused');
  const reasonRef = useRef<MutationReason>('initial');

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      phaseRef.current = 'paused';
      reasonRef.current = 'initial';
      return;
    }

    const instance = createMutation({
      element,
      mutation: mutationInit,
      onMutations: (records) => onMutationsRef.current(records),
      visibilityAware,
      intersectionOptions,
    });

    phaseRef.current = instance.phase;
    reasonRef.current = instance.phaseReason;

    return () => instance.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visibilityAware]);

  return {
    ref,
    get phase() {
      return phaseRef.current;
    },
    get phaseReason() {
      return reasonRef.current;
    },
  };
}
