import { useState, useEffect, useRef } from 'react';

import {
  prefersReducedMotion,
  type ReducedMotionBehavior,
} from '../../core/loop';
import { clamp01, easeOutCubic } from '../../ease';

export interface UseTweenOptions {
  target: number;
  duration?: number;
  delay?: number;
  easing?: (progress: number) => number;
  enabled?: boolean;
  /** Default: `'complete'` — tweens jump to target under reduced motion. */
  reducedMotion?: ReducedMotionBehavior;
}

/**
 * Animate a value from its current position to `target` over `duration`.
 *
 * Uses `useState` per frame — appropriate for cheap renders (counters, opacity,
 * progress bars). For batch animations, use `useLoop` with ref-based DOM writes.
 *
 * @example
 * const value = useTween({ target: 100, duration: 500 });
 */
export function useTween(options: UseTweenOptions): number {
  const {
    target,
    duration = 300,
    delay = 0,
    easing = easeOutCubic,
    enabled = true,
    reducedMotion = 'complete',
  } = options;

  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const currentRef = useRef(target);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // First render: sync refs without animating.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      jumpToTarget(target, fromRef, currentRef, setValue);
      return;
    }

    // Disabled or reduced motion: jump immediately.
    if (!enabled || (reducedMotion !== 'ignore' && prefersReducedMotion())) {
      jumpToTarget(target, fromRef, currentRef, setValue);
      return;
    }

    // Already at target: nothing to animate.
    const from: number = currentRef.current;
    if (from === target) return;

    let rafId: number;
    let startTime: number | null = null;

    function tick(now: number): void {
      if (startTime === null) startTime = now;
      const elapsed: number = now - startTime - delay;

      // Still in the delay period — keep scheduling.
      if (elapsed < 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const progress: number = clamp01(elapsed / duration);
      const current: number = from + (target - from) * easing(progress);
      currentRef.current = current;
      setValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      // Preserve where we actually are so the next tween starts from here.
      fromRef.current = currentRef.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, delay, enabled, reducedMotion]);

  return value;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function jumpToTarget(
  target: number,
  fromRef: React.RefObject<number>,
  currentRef: React.RefObject<number>,
  setValue: (value: number) => void,
): void {
  fromRef.current = target;
  currentRef.current = target;
  setValue(target);
}
