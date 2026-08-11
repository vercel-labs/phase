import { useState, useEffect, useRef, type RefObject } from 'react';

import {
  createLifecycle,
  type Lifecycle,
  type LifecyclePhase,
  type LifecycleReason,
  type LifecycleReducedMotion,
} from '../../core/lifecycle';
import { useSyncedRef } from '../use-synced-ref';

export interface UseLifecycleOptions<T extends Element = HTMLDivElement> {
  /**
   * Element whose visibility gates the lifecycle. Optional. When omitted, attach
   * the returned `ref`.
   */
  ref?: RefObject<T | null>;
  /** Whether reduced motion pauses the lifecycle. Default `'pause'`. */
  reducedMotion?: LifecycleReducedMotion;
  /** Manually pause regardless of visibility (e.g. a panel opened over the animation). */
  paused?: boolean;
  /** When `false`, the lifecycle is torn down and reports `idle`. Default `true`. */
  enabled?: boolean;
  intersectionOptions?: IntersectionObserverInit;
  /**
   * Synchronous callback fired in the observer/MQL callback, before React
   * schedules a render. Use to post messages to a worker or update a ref
   * without waiting for the React commit.
   */
  onPhaseChange?: (phase: LifecyclePhase, reason: LifecycleReason) => void;
}

export interface UseLifecycleResult<T extends Element = HTMLDivElement> {
  /** Attach to the element whose visibility should gate your loop. */
  ref: RefObject<T | null>;
  phase: LifecyclePhase;
  phaseReason: LifecycleReason;
  /** Convenience: `phase === 'active'`. Drive your own render loop off this. */
  isActive: boolean;
}

type LifecycleState = Omit<UseLifecycleResult, 'ref' | 'isActive'>;

const INITIAL_STATE: LifecycleState = {
  phase: 'idle',
  phaseReason: 'initial',
};

/**
 * React binding for `createLifecycle`. The activation signal for loops you own.
 *
 * Returns `active` / `paused` so a consumer-owned render loop (WebGL, three.js, a
 * Web Worker) can pause when off-screen or under reduced motion. When `phase`
 * should drive the loop for you, use `useLoop` or `useCanvas` instead.
 *
 * @example
 * const { ref, isActive } = useLifecycle();
 * useEffect(() => {
 *   if (!isActive) return;
 *   const id = requestAnimationFrame(function render() {
 *     renderer.render();
 *     requestAnimationFrame(render);
 *   });
 *   return () => cancelAnimationFrame(id);
 * }, [isActive]);
 * return <canvas ref={ref} />;
 */
export function useLifecycle<T extends Element = HTMLDivElement>(
  options?: UseLifecycleOptions<T>,
): UseLifecycleResult<T> {
  const { reducedMotion, intersectionOptions, enabled = true } = options ?? {};
  const paused = options?.paused ?? false;
  const onPhaseChangeRef = useSyncedRef(options?.onPhaseChange);
  const intersectionRoot = intersectionOptions?.root;
  const intersectionRootMargin = intersectionOptions?.rootMargin;
  const intersectionThreshold = intersectionOptions?.threshold;
  const intersectionThresholdKey = Array.isArray(intersectionThreshold)
    ? intersectionThreshold.join(',')
    : intersectionThreshold;

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  const [state, setState] = useState<LifecycleState>(INITIAL_STATE);
  const lifecycleRef = useRef<Lifecycle | null>(null);

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element || !enabled) {
      setState(INITIAL_STATE);
      return;
    }

    const lifecycle = createLifecycle({
      element,
      reducedMotion,
      intersectionOptions,
      onPhaseChange: (phase, phaseReason) => {
        onPhaseChangeRef.current?.(phase, phaseReason);
        setState({ phase, phaseReason });
      },
    });
    lifecycleRef.current = lifecycle;

    // Apply the manual pause that was requested at mount.
    if (paused) lifecycle.pause();

    return () => {
      lifecycle.stop();
      lifecycleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    reducedMotion,
    intersectionRoot,
    intersectionRootMargin,
    intersectionThresholdKey,
  ]);

  // Sync subsequent `paused` changes onto the live lifecycle.
  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle) return;
    if (paused) lifecycle.pause();
    else lifecycle.resume();
  }, [paused]);

  return { ref, ...state, isActive: state.phase === 'active' };
}
