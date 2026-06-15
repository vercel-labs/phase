import { useState, useEffect, useRef, type RefObject } from 'react';

import { observeResize } from '../../core/_internal/pool/ro-pool.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerBreakpoint {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

// ---------------------------------------------------------------------------
// useContainerQuery
// ---------------------------------------------------------------------------

/**
 * Returns whether an element matches a size-based container breakpoint.
 *
 * Unlike `useSize` (which re-renders on every pixel of resize), this hook only
 * triggers a re-render when the match result **changes** — i.e., when the element
 * crosses a breakpoint boundary. During continuous resize (window drag), zero
 * re-renders occur unless a threshold is crossed.
 *
 * Uses the shared ResizeObserver singleton from {@link observeResize} — zero additional observers created.
 *
 * @example
 * const isWide = useContainerQuery(ref, { minWidth: 600 });
 * useLoop({ ref, onTick: draw, enabled: isWide });
 *
 * @example
 * const isLargeEnough = useContainerQuery(ref, { minWidth: 400, minHeight: 300 });
 */
export function useContainerQuery(
  ref: RefObject<Element | null>,
  breakpoint: ContainerBreakpoint,
): boolean {
  const [matches, setMatches] = useState(false);
  const matchesRef = useRef(false);

  const { minWidth, maxWidth, minHeight, maxHeight } = breakpoint;

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    const unobserve: () => void = observeResize(element, (entry) => {
      const box = entry.contentBoxSize[0];
      if (!box) return;

      const width: number = box.inlineSize;
      const height: number = box.blockSize;

      const nowMatches: boolean = evaluateBreakpoint(
        width,
        height,
        minWidth,
        maxWidth,
        minHeight,
        maxHeight,
      );

      // Only re-render when the boolean flips — not on every pixel of resize.
      if (nowMatches !== matchesRef.current) {
        matchesRef.current = nowMatches;
        setMatches(nowMatches);
      }
    });

    return unobserve;
  }, [ref, minWidth, maxWidth, minHeight, maxHeight]);

  return matches;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function evaluateBreakpoint(
  width: number,
  height: number,
  minWidth?: number,
  maxWidth?: number,
  minHeight?: number,
  maxHeight?: number,
): boolean {
  if (minWidth !== undefined && width < minWidth) return false;
  if (maxWidth !== undefined && width > maxWidth) return false;
  if (minHeight !== undefined && height < minHeight) return false;
  if (maxHeight !== undefined && height > maxHeight) return false;
  return true;
}
