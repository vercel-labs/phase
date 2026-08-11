import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createLoop,
  type LoopPhase,
  type LoopReason,
  type LoopReducedMotion,
  type Quality,
  type DegradedBehavior,
  type DegradedReason,
  type QualityChangeCallback,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { useSyncedRef } from '../use-synced-ref';

/**
 * Per-frame loop callback. Receives the current frame state. Write to refs or
 * DOM directly. Never call React `setState` here (60 calls/sec = 60
 * re-renders/sec).
 */
export type LoopTickFn = (frame: FrameState) => void;

export interface UseLoopOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to observe. Optional. When omitted, attach the returned `ref`.
   * Pass your own ref to share it or attach it elsewhere.
   */
  ref?: RefObject<T | null>;
  /**
   * Called every frame. Write to refs or DOM directly. Never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: LoopTickFn;
  /** Base FPS cap. Default: uncapped (display refresh rate). */
  fps?: number;
  enabled?: boolean;
  /** Reduced-motion behavior. Default `'pause'` (one static frame once visible). */
  reducedMotion?: LoopReducedMotion;
  /**
   * Behavior while `document.hasFocus()` is false. Default `'pause'`.
   * Offscreen/background-tab visibility is separate and always pauses.
   */
  unfocused?: DegradedBehavior;
  /**
   * Behavior after three consecutive frames exceed 1.5x the current target
   * interval. Default `'throttle'`.
   */
  frameBudget?: DegradedBehavior;
  /** Shared throttle cap; never raises a lower `fps` cap. Default `30`. */
  throttleFps?: number;
  /** Options forwarded to the pooled visibility observer. Value changes rebuild the loop. */
  intersectionOptions?: IntersectionObserverInit;
  /** Transient quality notification. Does not trigger a React render. */
  onQualityChange?: QualityChangeCallback;
}

export interface UseLoopResult<T extends Element = HTMLDivElement> {
  /** Attach to the element you want to animate. */
  ref: RefObject<T | null>;
  phase: LoopPhase;
  phaseReason: LoopReason;
  /** Always-current quality state. Quality changes do not trigger a render. */
  quality: Quality;
  /** Active signal; `'unfocused'` has reporting priority when both are active. */
  qualityReason: DegradedReason | undefined;
  /** Resolved behavior after applying pause > throttle > ignore precedence. */
  qualityBehavior: DegradedBehavior | undefined;
}

type LoopState = Pick<UseLoopResult, 'phase' | 'phaseReason'>;

// Disabled or unmounted: the loop isn't created, so it reports `idle` — matching
// useCanvas and useLifecycle. (Toggling `enabled` tears down and recreates the
// loop, so "idle/will start fresh" is more accurate than "paused/will resume".)
const INITIAL_STATE: LoopState = {
  phase: 'idle',
  phaseReason: 'initial',
};

/**
 * Ref-based animation loop that never triggers re-renders from the frame loop.
 *
 * @example
 * const { ref, phase, qualityReason, qualityBehavior } = useLoop({
 *   onTick: (frame) => {
 *     ref.current.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
 *   },
 * });
 * // qualityReason identifies the signal; qualityBehavior is the resolved action.
 * return <div ref={ref} />;
 */
export function useLoop<T extends Element = HTMLDivElement>(
  options: UseLoopOptions<T>,
): UseLoopResult<T> {
  const {
    fps,
    enabled = true,
    reducedMotion,
    unfocused,
    frameBudget,
    throttleFps,
    intersectionOptions,
  } = options;
  const onTickRef = useSyncedRef(options.onTick);
  const onQualityChangeRef = useSyncedRef(options.onQualityChange);
  const intersectionRoot = intersectionOptions?.root;
  const intersectionRootMargin = intersectionOptions?.rootMargin;
  const intersectionThreshold = intersectionOptions?.threshold;
  const intersectionThresholdKey = Array.isArray(intersectionThreshold)
    ? intersectionThreshold.join(',')
    : intersectionThreshold;

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;

  const [state, setState] = useState<LoopState>(INITIAL_STATE);

  const qualityRef = useRef<Quality>('full');
  const qualityReasonRef = useRef<DegradedReason | undefined>(undefined);
  const qualityBehaviorRef = useRef<DegradedBehavior | undefined>(undefined);

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element || !enabled) {
      setState(INITIAL_STATE);
      qualityRef.current = 'full';
      qualityReasonRef.current = undefined;
      qualityBehaviorRef.current = undefined;
      return;
    }

    const loop = createLoop({
      element,
      onTick: (frame) => onTickRef.current(frame),
      fps,
      reducedMotion,
      unfocused,
      frameBudget,
      throttleFps,
      intersectionOptions,
      onPhaseChange: (phase, reason) => {
        setState({
          phase,
          phaseReason: reason,
        });
      },
      onQualityChange: (quality, qualityReason, qualityBehavior) => {
        qualityRef.current = quality;
        qualityReasonRef.current = qualityReason;
        qualityBehaviorRef.current = qualityBehavior;
        onQualityChangeRef.current?.(quality, qualityReason, qualityBehavior);
      },
    });

    return () => {
      loop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    fps,
    reducedMotion,
    unfocused,
    frameBudget,
    throttleFps,
    intersectionRoot,
    intersectionRootMargin,
    intersectionThresholdKey,
  ]);

  return {
    ref,
    ...state,
    get quality() {
      return qualityRef.current;
    },
    get qualityReason() {
      return qualityReasonRef.current;
    },
    get qualityBehavior() {
      return qualityBehaviorRef.current;
    },
  };
}
