import {
  createLoop,
  type LoopPhase,
  type LoopReason,
  type Quality,
  type DegradedBehavior,
  type DegradedReason,
  type ReducedMotionBehavior,
} from '@usephase/core';
import type { FrameState } from '@usephase/core';
import { conflictingTargetError } from '@usephase/core/internal';
import { useState, useEffect, useRef, type RefObject } from 'react';

import { degradedConfig } from '../_internal/degraded-config';
import { useElementEffect } from '../_internal/use-element-effect';
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
   * Anchor to the page instead of an element. Pass `'page'`. Mutually
   * exclusive with `ref`.
   *
   * This is a string rather than `document` because hook options are built
   * during render, and render runs on the server for a client component. A
   * literal `document` there throws before the hook is called.
   */
  target?: 'page';
  /**
   * Called every frame. Write to refs or DOM directly. Never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: LoopTickFn;
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
 * Event-derived callbacks sharing its clock protocol run before `onTick` when
 * queued before frame dispatch.
 * Detaching the element stops the loop and resets phase and quality. A new
 * element starts its own loop after commit.
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
    target,
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
  const latestRef = useSyncedRef(ref);

  const [state, setState] = useState<LoopState>(INITIAL_STATE);

  const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);

  function subscribe(anchor: Element | Document): () => void {
    const loop = createLoop({
      target: anchor,
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
      if (loopRef.current === loop) loopRef.current = null;
    };
  }

  // The page has no element to attach, so use document after mount.
  useEffect(() => {
    if (target && options.ref) conflictingTargetError('useLoop');
    if (target !== 'page') return;
    if (!enabled) {
      setState(INITIAL_STATE);
      return;
    }

    const unsubscribe = subscribe(document);
    return () => {
      unsubscribe();
      setState(INITIAL_STATE);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fps, reducedMotion, degraded, degradedFps, target]);

  // A condition may add or remove the element; React may also replace it.
  useElementEffect(
    ref,
    (element) => {
      if (target) return;
      if (!enabled) {
        setState(INITIAL_STATE);
        return;
      }

      const unsubscribe = subscribe(element);
      return () => {
        unsubscribe();
        if (latestRef.current.current !== element) setState(INITIAL_STATE);
      };
    },
    [enabled, fps, reducedMotion, degraded, degradedFps, target],
  );

  return { ref, ...state };
}
