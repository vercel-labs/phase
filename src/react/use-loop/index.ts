import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createLoop,
  type LoopPhase,
  type LoopReason,
  type Quality,
  type DegradedReason,
  type ReducedMotionBehavior,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { useSyncedRef } from '../use-synced-ref';

export interface UseLoopOptions {
  ref: RefObject<Element | null>;
  /**
   * Called every frame. Write to refs or DOM directly — never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: (frame: FrameState) => void;
  fps?: number;
  enabled?: boolean;
  reducedMotion?: ReducedMotionBehavior;
  intersectionOptions?: IntersectionObserverInit;
}

export interface UseLoopResult {
  phase: LoopPhase;
  phaseReason: LoopReason;
  quality: Quality;
  qualityReason: DegradedReason | undefined;
}

const DISABLED_STATE: UseLoopResult = {
  phase: 'paused',
  phaseReason: 'enabled',
  quality: 'full',
  qualityReason: undefined,
};

const INITIAL_STATE: UseLoopResult = {
  phase: 'idle',
  phaseReason: 'initial',
  quality: 'full',
  qualityReason: undefined,
};

/**
 * Ref-based animation loop that never triggers re-renders from the frame loop.
 *
 * @example
 * const { phase } = useLoop({
 *   ref: containerRef,
 *   onTick: (frame) => draw(ctx, frame.time, size),
 * });
 */
export function useLoop(options: UseLoopOptions): UseLoopResult {
  const {
    ref,
    fps,
    enabled = true,
    reducedMotion,
    intersectionOptions,
  } = options;
  const onTickRef = useSyncedRef(options.onTick);

  const [state, setState] = useState<UseLoopResult>(INITIAL_STATE);

  const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element || !enabled) {
      setState(DISABLED_STATE);
      return;
    }

    const loop = createLoop({
      element,
      onTick: (frame) => onTickRef.current(frame),
      fps,
      reducedMotion,
      intersectionOptions,
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
  }, [enabled, fps, reducedMotion]);

  return state;
}
