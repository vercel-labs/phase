import { useState, useEffect, useRef } from 'react';

import { invalidDurationError } from '../../core/_internal/errors';
import { prefersReducedMotion } from '../../core/reduced-motion';
import { clamp01, easeOutCubic } from '../../ease';
import { useSyncedRef } from '../use-synced-ref';

/**
 * Behavior under reduced motion. `'complete'` jumps straight to the target
 * (the value still arrives, the animation is skipped); `'ignore'` animates
 * regardless. Tweens have a defined target, so there is no `'pause'`.
 */
export type TweenReducedMotion = 'complete' | 'ignore';

export interface UseTweenOptions {
  target: number;
  duration?: number;
  delay?: number;
  easing?: (progress: number) => number;
  enabled?: boolean;
  /** Default: `'complete'`. Tweens jump to target under reduced motion. */
  reducedMotion?: TweenReducedMotion;
}

/**
 * Animate a value from its current position to `target` over `duration`.
 *
 * Uses `useState` per frame. Appropriate for cheap renders (counters, opacity,
 * progress bars). For batch animations, use `useLoop` with ref-based DOM writes.
 *
 * @remarks
 * Unlike `createTicker`/`createLoop`, `useTween` drives its own rAF rather than
 * the shared frame-locked clock. It's a finite, self-completing tween whose value
 * must land in React state, so it doesn't need cross-loop visual sync, strong
 * pause, or delta clamping. Routing it through the shared clock would add bundle
 * weight for no benefit.
 *
 * The reduced-motion preference is read when the effect starts rather than
 * subscribed mid-tween. The latest `easing` callback is read from a synced ref
 * without restarting the active tween.
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
  const easingRef = useSyncedRef(easing);

  const fromRef = useRef(target);
  const currentRef = useRef(target);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!Number.isFinite(duration) || duration <= 0) {
      invalidDurationError('useTween', duration);
    }

    // First render: sync refs without animating.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      jumpToTarget({ target, fromRef, currentRef, setValue });
      return;
    }

    // Disabled or reduced motion: jump immediately.
    if (!enabled || (reducedMotion !== 'ignore' && prefersReducedMotion())) {
      jumpToTarget({ target, fromRef, currentRef, setValue });
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
      const current: number =
        from + (target - from) * easingRef.current(progress);
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

interface JumpToTargetOptions {
  target: number;
  fromRef: React.RefObject<number>;
  currentRef: React.RefObject<number>;
  setValue: (value: number) => void;
}

function jumpToTarget(options: JumpToTargetOptions): void {
  const { target, fromRef, currentRef, setValue } = options;
  fromRef.current = target;
  currentRef.current = target;
  setValue(target);
}
