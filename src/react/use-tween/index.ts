import { useState, useEffect, useRef } from 'react';

import { invalidDurationError } from '../../core/_internal/errors';
import {
  prefersReducedMotion,
  subscribeReducedMotion,
} from '../../core/reduced-motion';
import { clamp01, easeOutCubic } from '../../ease';
import { useSyncedRef } from '../use-synced-ref';

/** Reduced-motion behavior for a finite tween. Finite tweens complete or explicitly ignore the preference because pausing would leave their value between endpoints. */
export type TweenReducedMotion = 'complete' | 'ignore';

export interface UseTweenOptions {
  to: number;
  duration?: number;
  delay?: number;
  easing?: (progress: number) => number;
  enabled?: boolean;
  /** Default: `'complete'`. Tweens jump straight to the destination under reduced motion. */
  reducedMotion?: TweenReducedMotion;
}

/**
 * Animate a value from its current position toward `to` over `duration`.
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
 * @example
 * const value = useTween({ to: 100, duration: 500 });
 */
export function useTween(options: UseTweenOptions): number {
  const {
    to,
    duration = 300,
    delay = 0,
    easing = easeOutCubic,
    enabled = true,
    reducedMotion = 'complete',
  } = options;

  const [value, setValue] = useState(to);
  const easingRef = useSyncedRef(easing);

  const fromRef = useRef(to);
  const currentRef = useRef(to);
  const isFirstRender = useRef(true);
  const completeRef = useRef<(() => void) | null>(null);
  const unsubscribeReducedMotionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!Number.isFinite(duration) || duration <= 0) {
      invalidDurationError('useTween', duration);
    }

    // First render: sync refs without animating.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      jumpToTarget({ to, fromRef, currentRef, setValue });
      return;
    }

    if (!enabled) {
      jumpToTarget({ to, fromRef, currentRef, setValue });
      return;
    }

    // Already at the destination: nothing to animate.
    const from: number = currentRef.current;
    if (from === to) return;

    let rafId: number | null = null;
    let startTime: number | null = null;
    let completed = false;

    function complete(): void {
      if (completed) return;
      completed = true;
      completeRef.current = null;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      clearReducedMotionSubscription(unsubscribeReducedMotionRef);
      jumpToTarget({ to, fromRef, currentRef, setValue });
    }

    completeRef.current = complete;
    syncReducedMotionSubscription(
      reducedMotion,
      completeRef,
      unsubscribeReducedMotionRef,
    );

    function tick(now: number): void {
      if (completed) return;
      rafId = null;
      if (startTime === null) startTime = now;
      const elapsed: number = now - startTime - delay;

      // Still in the delay period — keep scheduling.
      if (elapsed < 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const progress: number = clamp01(elapsed / duration);
      const current: number =
        progress === 1 ? to : from + (to - from) * easingRef.current(progress);
      currentRef.current = current;
      setValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        completed = true;
        completeRef.current = null;
        clearReducedMotionSubscription(unsubscribeReducedMotionRef);
        fromRef.current = to;
      }
    }

    if (completed) {
      completeRef.current = null;
      return;
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      completed = true;
      completeRef.current = null;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      clearReducedMotionSubscription(unsubscribeReducedMotionRef);
      // Preserve where we actually are so the next tween starts from here.
      fromRef.current = currentRef.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, duration, delay, enabled]);

  useEffect(() => {
    syncReducedMotionSubscription(
      reducedMotion,
      completeRef,
      unsubscribeReducedMotionRef,
    );

    return () => clearReducedMotionSubscription(unsubscribeReducedMotionRef);
  }, [reducedMotion]);

  return value;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface JumpToTargetOptions {
  to: number;
  fromRef: React.RefObject<number>;
  currentRef: React.RefObject<number>;
  setValue: (value: number) => void;
}

function syncReducedMotionSubscription(
  reducedMotion: TweenReducedMotion,
  completeRef: React.RefObject<(() => void) | null>,
  unsubscribeRef: React.RefObject<(() => void) | null>,
): void {
  clearReducedMotionSubscription(unsubscribeRef);
  if (reducedMotion !== 'complete' || completeRef.current === null) return;

  if (prefersReducedMotion()) {
    completeRef.current();
    return;
  }

  unsubscribeRef.current = subscribeReducedMotion((matches) => {
    if (matches) completeRef.current?.();
  });
}

function clearReducedMotionSubscription(
  unsubscribeRef: React.RefObject<(() => void) | null>,
): void {
  unsubscribeRef.current?.();
  unsubscribeRef.current = null;
}

function jumpToTarget(options: JumpToTargetOptions): void {
  const { to, fromRef, currentRef, setValue } = options;
  fromRef.current = to;
  currentRef.current = to;
  setValue(to);
}
