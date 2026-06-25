import { noElementError, serverContextError } from '../_internal/errors';
import { observeIntersection } from '../_internal/pool/io-pool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollProgressOptions {
  element: Element;
  /** Called when the intersection ratio changes at a threshold crossing. */
  onProgress: (ratio: number) => void;
  /** Number of evenly-spaced thresholds. Default 20 (~5% granularity). */
  steps?: number;
  root?: Element | Document | null;
  rootMargin?: string;
}

export interface ScrollProgress {
  /** Current intersection ratio (0–1). Synchronous read of the last-reported value. */
  readonly ratio: number;
  stop(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_STEPS = 20;

// ---------------------------------------------------------------------------
// Threshold cache
//
// Most consumers use the same step count. Cache the array so the IO pool
// receives stable references and identical pool keys without re-allocating.
// ---------------------------------------------------------------------------

const thresholdCache = new Map<number, number[]>();

function buildThresholds(steps: number): number[] {
  const cached: number[] | undefined = thresholdCache.get(steps);
  if (cached) return cached;

  const thresholds: number[] = [];
  for (let i = 0; i <= steps; i++) {
    thresholds.push(i / steps);
  }
  thresholdCache.set(steps, thresholds);
  return thresholds;
}

// ---------------------------------------------------------------------------
// createScrollProgress
// ---------------------------------------------------------------------------

/**
 * Observe what fraction of an element is visible in the viewport (0–1).
 *
 * Uses the shared IntersectionObserver pool with multi-threshold options.
 * Multiple instances with the same `steps` share a single IO.
 *
 * @example
 * const progress = createScrollProgress({
 *   element: el,
 *   onProgress: (ratio) => {
 *     el.style.opacity = String(ratio);
 *   },
 * });
 * // cleanup:
 * progress.stop();
 */
export function createScrollProgress(
  options: ScrollProgressOptions,
): ScrollProgress {
  if (typeof IntersectionObserver === 'undefined') {
    serverContextError('createScrollProgress');
  }

  const {
    element,
    onProgress,
    steps = DEFAULT_STEPS,
    root,
    rootMargin,
  } = options;

  if (!element) noElementError('createScrollProgress');

  let _ratio = 0;
  let stopped = false;

  const threshold: number[] = buildThresholds(steps);

  const unobserve: () => void = observeIntersection({
    element,
    onIntersect: (entry: IntersectionObserverEntry) => {
      const newRatio: number = entry.intersectionRatio;
      if (newRatio === _ratio) return;
      _ratio = newRatio;
      onProgress(newRatio);
    },
    root,
    rootMargin,
    threshold,
  });

  return {
    get ratio(): number {
      return _ratio;
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      unobserve();
    },
  };
}
