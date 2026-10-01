import { createScrollProgress } from '@usephase/core';
import { useState, useRef, type RefObject } from 'react';

import { useElementEffect } from '../_internal/use-element-effect';
import { useSyncedRef } from '../use-synced-ref';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScrollProgressCallback = (progress: number) => void;

export interface UseScrollProgressOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to observe. Optional. When omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
  /** Number of evenly-spaced thresholds. Default 20 (~5% granularity). */
  steps?: number;
  root?: Element | null;
  rootMargin?: string;
  /**
   * Called when the intersection ratio changes at a threshold crossing.
   * When provided, `progress` is omitted from the return type, and observer
   * updates do not cause the hook to render. Changing the attached element may
   * add one render while the hook starts observing the new target.
   */
  onProgress?: ScrollProgressCallback;
}

export interface UseScrollProgressReactiveResult<
  T extends Element = HTMLDivElement,
> {
  ref: RefObject<T | null>;
  /**
   * Most recently reported visible fraction (0 to 1), retained while the ref
   * has no element.
   */
  progress: number;
  /** Most recently reported ratio. Updating this ref does not cause a render. */
  progressRef: RefObject<number>;
}

export interface UseScrollProgressTransientResult<
  T extends Element = HTMLDivElement,
> {
  ref: RefObject<T | null>;
  /** Most recently reported ratio. Updating this ref does not cause a render. */
  progressRef: RefObject<number>;
}

/** @deprecated Use `UseScrollProgressReactiveResult` or `UseScrollProgressTransientResult`. */
export type UseScrollProgressResult<T extends Element = HTMLDivElement> =
  UseScrollProgressReactiveResult<T>;

// ---------------------------------------------------------------------------
// useScrollProgress
// ---------------------------------------------------------------------------

/**
 * Element visibility ratio (0–1) via the shared IntersectionObserver pool.
 *
 * Pass `onProgress` to receive observer updates without a render from the hook.
 * Without it, `progress` updates via state at each threshold crossing.
 * `progressRef` holds the most recently reported ratio in both modes.
 *
 * Tracks the element attached to the ref across commits. The hook keeps the
 * last reported ratio if React detaches or replaces the element. Each
 * subscription starts at 0, so an initial ratio of 0 does not call
 * `onProgress` or clear a previous nonzero value.
 *
 * @example
 * // Reactive (re-renders at threshold crossings)
 * const { ref, progress } = useScrollProgress();
 *
 * // Transient (observer updates do not re-render; read progressRef in onTick)
 * const { ref, progressRef } = useScrollProgress({
 *   onProgress: (p) => { el.style.opacity = String(p); },
 * });
 */
export function useScrollProgress<T extends Element = HTMLDivElement>(
  options: UseScrollProgressOptions<T> & {
    onProgress: ScrollProgressCallback;
  },
): UseScrollProgressTransientResult<T>;
export function useScrollProgress<T extends Element = HTMLDivElement>(
  options?: UseScrollProgressOptions<T>,
): UseScrollProgressReactiveResult<T>;
export function useScrollProgress<T extends Element = HTMLDivElement>(
  options?: UseScrollProgressOptions<T>,
): UseScrollProgressReactiveResult<T> | UseScrollProgressTransientResult<T> {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const steps: number | undefined = options?.steps;
  const rootMargin: string | undefined = options?.rootMargin;
  const onProgressRef = useSyncedRef(options?.onProgress);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  useElementEffect(
    ref,
    (element) => {
      const scrollProgress = createScrollProgress({
        target: element,
        onProgress: (ratio: number) => {
          if (element !== ref.current) return;

          progressRef.current = ratio;

          if (onProgressRef.current) {
            onProgressRef.current(ratio);
          } else {
            setProgress(ratio);
          }
        },
        steps,
        root: options?.root,
        rootMargin,
      });

      return () => scrollProgress.stop();
    },
    [steps, rootMargin],
  );

  return { ref, progress, progressRef };
}
