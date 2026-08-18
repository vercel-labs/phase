import { useState, useEffect, useRef, type RefObject } from 'react';

import { createScrollProgress } from '../../core/scroll-progress';
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
   * Called on every threshold crossing. When provided, `progress` stays `0`
   * and no re-renders occur, the right path for scroll-driven animation
   * consumers that read progress imperatively.
   */
  onProgress?: ScrollProgressCallback;
}

export interface UseScrollProgressReactiveResult<
  T extends Element = HTMLDivElement,
> {
  ref: RefObject<T | null>;
  /** Fraction of the element currently visible (0–1). */
  progress: number;
  /** Fraction visible via ref. Always current, never triggers re-render. */
  progressRef: RefObject<number>;
}

export interface UseScrollProgressTransientResult<
  T extends Element = HTMLDivElement,
> {
  ref: RefObject<T | null>;
  /** Fraction visible via ref. Always current, never triggers re-render. */
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
 * Pass `onProgress` for zero-re-render mode (scroll-driven animation).
 * Without it, `progress` updates via state at each threshold crossing.
 * `progressRef` is always current in both modes.
 *
 * @example
 * // Reactive (re-renders at threshold crossings)
 * const { ref, progress } = useScrollProgress();
 *
 * // Transient (no re-renders — read progressRef in onTick)
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

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    const scrollProgress = createScrollProgress({
      target: element,
      onProgress: (ratio: number) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, rootMargin]);

  return { ref, progress, progressRef };
}
