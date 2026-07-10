import { useEffect, useRef, type RefObject } from 'react';

import {
  createPointer,
  type PointerPhase,
  type PointerReason,
  type PointerState,
} from '../../core/pointer';
import { useSyncedRef } from '../use-synced-ref';

export type PointerCallback = (state: PointerState) => void;

export interface UsePointerOptions<T extends Element = HTMLDivElement> {
  /** Element to track. When omitted, attach the returned `ref`. */
  ref?: RefObject<T | null>;
  /**
   * Called once per rAF frame with the latest pointer position.
   * Reads `getBoundingClientRect` at most once per frame.
   */
  onPointer: PointerCallback;
  /** Pause tracking while the element is off-screen. Default `true`. */
  visibilityAware?: boolean;
  /** Tear down the tracker entirely. Default `true`. */
  enabled?: boolean;
  /** IO options forwarded to the visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
}

export interface UsePointerResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  phase: PointerPhase;
  phaseReason: PointerReason;
}

/**
 * Lifecycle-aware pointer tracker with rAF-batched `getBoundingClientRect`.
 *
 * Wraps `createPointer` with React lifecycle management. Reads the element
 * rect at most once per rAF frame, not per `pointermove` event. Auto-pauses
 * when the element is off-screen, tears down on unmount.
 *
 * @example
 * const { ref } = usePointer({
 *   onPointer: (state) => {
 *     cursorRef.current.style.transform =
 *       `translate(${state.x}px, ${state.y}px)`;
 *   },
 * });
 * return <div ref={ref}>...</div>;
 */
export function usePointer<T extends Element = HTMLDivElement>(
  options: UsePointerOptions<T>,
): UsePointerResult<T> {
  const {
    visibilityAware = true,
    enabled = true,
    intersectionOptions,
  } = options;

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;
  const onPointerRef = useSyncedRef(options.onPointer);
  const phaseRef = useRef<PointerPhase>('idle');
  const reasonRef = useRef<PointerReason>('initial');

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      phaseRef.current = 'idle';
      reasonRef.current = 'initial';
      return;
    }

    const instance = createPointer({
      element,
      onPointer: (state) => onPointerRef.current(state),
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
