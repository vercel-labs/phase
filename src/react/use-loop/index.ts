import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createLoop,
  type LoopPhase,
  type LoopReason,
  type Quality,
  type DegradedBehavior,
  type DegradedReason,
  type ReducedMotionBehavior,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { degradedConfig } from '../_internal/degraded-config';
import { useSyncedRef } from '../use-synced-ref';

export interface UseLoopOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to observe. Optional — when omitted, attach the returned `ref`.
   * Pass your own ref to share it or attach it elsewhere.
   */
  ref?: RefObject<T | null>;
  /**
   * Called every frame. Write to refs or DOM directly — never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: (frame: FrameState) => void;
  fps?: number;
  enabled?: boolean;
  reducedMotion?: ReducedMotionBehavior;
  /** Behavior when quality degrades (window blur, frame-budget). Default `'throttle'`. */
  degraded?: DegradedBehavior;
  /** FPS cap when `degraded` is `'throttle'`. Default `30`. */
  degradedFps?: number;
  intersectionOptions?: IntersectionObserverInit;
}

export interface UseLoopResult<T extends Element = HTMLDivElement> {
  /** Attach to the element you want to animate. */
  ref: RefObject<T | null>;
  phase: LoopPhase;
  phaseReason: LoopReason;
  quality: Quality;
  qualityReason: DegradedReason | undefined;
}

type LoopState = Omit<UseLoopResult, 'ref'>;

// Disabled or unmounted: the loop isn't created, so it reports `idle` — matching
// useCanvas and useLifecycle. (Toggling `enabled` tears down and recreates the
// loop, so "idle/will start fresh" is more accurate than "paused/will resume".)
const INITIAL_STATE: LoopState = {
  phase: 'idle',
  phaseReason: 'initial',
  quality: 'full',
  qualityReason: undefined,
};

/**
 * Ref-based animation loop that never triggers re-renders from the frame loop.
 *
 * @example
 * const { ref, phase } = useLoop({
 *   onTick: (frame) => {
 *     ref.current.style.transform = `translateX(${frame.elapsed * 0.1}px)`;
 *   },
 * });
 * return <div ref={ref} />;
 */
export function useLoop<T extends Element = HTMLDivElement>(
  options: UseLoopOptions<T>,
): UseLoopResult<T> {
  const {
    fps,
    enabled = true,
    reducedMotion,
    degraded,
    degradedFps,
    intersectionOptions,
  } = options;
  const onTickRef = useSyncedRef(options.onTick);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;

  const [state, setState] = useState<LoopState>(INITIAL_STATE);

  const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element || !enabled) {
      setState(INITIAL_STATE);
      return;
    }

    const loop = createLoop({
      element,
      onTick: (frame) => onTickRef.current(frame),
      fps,
      reducedMotion,
      intersectionOptions,
      ...degradedConfig(degraded, degradedFps),
      onPhaseChange: (phase, reason) => {
        // Read from loopRef instead of the local `loop` variable to avoid
        // accessing it before createLoop returns (start:'auto' fires
        // onPhaseChange synchronously during construction).
        const current = loopRef.current;
        setState({
          phase,
          phaseReason: reason,
          quality: current?.quality ?? 'full',
          qualityReason: current?.qualityReason,
        });
      },
    });
    loopRef.current = loop;

    return () => {
      loop.stop();
      loopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fps, reducedMotion, degraded, degradedFps]);

  return { ref, ...state };
}
