import { useState, useEffect, useRef, type RefObject } from 'react';

import { observeResize } from '../../core/_internal/pool/ro-pool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerBreakpoint {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface UseContainerQueryOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to measure. Optional. When omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
}

export interface UseContainerQueryResult<T extends Element = HTMLDivElement> {
  /** Attach to the element you want to match against the breakpoint. */
  ref: RefObject<T | null>;
  /** Whether the element currently matches the breakpoint. */
  matches: boolean;
}

// ---------------------------------------------------------------------------
// useContainerQuery
// ---------------------------------------------------------------------------

/**
 * Returns whether an element matches a size-based container breakpoint.
 *
 * Unlike `useSize` (which re-renders on every pixel of resize), this hook only
 * re-renders when the match result changes, i.e. when the element crosses a
 * breakpoint boundary. Uses the shared ResizeObserver singleton.
 *
 * @example
 * const { ref, matches } = useContainerQuery({ minWidth: 600 });
 * return <div ref={ref}>{matches ? 'wide' : 'narrow'}</div>;
 */
export function useContainerQuery<T extends Element = HTMLDivElement>(
  breakpoint: ContainerBreakpoint,
  options?: UseContainerQueryOptions<T>,
): UseContainerQueryResult<T> {
  const [matches, setMatches] = useState(false);
  const matchesRef = useRef(false);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minWidth, maxWidth, minHeight, maxHeight]);

  return { ref, matches };
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
