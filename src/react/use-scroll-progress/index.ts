import { useState, useEffect, useRef, type RefObject } from 'react';

import { createScrollProgress } from '../../core/scroll-progress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseScrollProgressOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to observe. Optional — when omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
  /** Number of evenly-spaced thresholds. Default 20 (~5% granularity). */
  steps?: number;
  root?: Element | null;
  rootMargin?: string;
}

export interface UseScrollProgressResult<T extends Element = HTMLDivElement> {
  /** Attach to the element whose visibility ratio you want to track. */
  ref: RefObject<T | null>;
  /** Fraction of the element currently visible (0–1). See `createScrollProgress` for semantics. */
  progress: number;
}

// ---------------------------------------------------------------------------
// useScrollProgress
// ---------------------------------------------------------------------------

/**
 * Element visibility ratio (0–1) via the shared IntersectionObserver pool.
 *
 * Reports the fraction of the element currently visible. Ideal for reveal/opacity
 * effects. Not a scroll-scrubbing engine: event-driven and quantized to `steps`.
 *
 * Re-renders only at threshold crossings (~20 per full viewport traversal).
 * `progress` is `0` before first observation and during SSR.
 *
 * @example
 * const { ref, progress } = useScrollProgress();
 * return <div ref={ref} style={{ opacity: progress }} />;
 */
export function useScrollProgress<T extends Element = HTMLDivElement>(
  options?: UseScrollProgressOptions<T>,
): UseScrollProgressResult<T> {
  const [progress, setProgress] = useState(0);
  const steps: number | undefined = options?.steps;
  const rootMargin: string | undefined = options?.rootMargin;

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    const scrollProgress = createScrollProgress({
      element,
      onProgress: setProgress,
      steps,
      root: options?.root,
      rootMargin,
    });

    return () => scrollProgress.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, rootMargin]);

  return { ref, progress };
}
