import { observeResize } from '@usephase/core/internal';
import { useState, useRef, type RefObject } from 'react';

import { useElementEffect } from '../_internal/use-element-effect';

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
  /** Last observed match, initially false and retained while detached. */
  matches: boolean;
}

// ---------------------------------------------------------------------------
// useContainerQuery
// ---------------------------------------------------------------------------

/**
 * Returns whether an element matches a size-based container breakpoint.
 *
 * Resize updates re-render only when the match result changes, i.e. when the
 * element crosses a breakpoint boundary. Uses the shared ResizeObserver
 * singleton. Element changes may add one lifecycle reconciliation render.
 * Tracks the element behind the ref across commits. A new element updates the
 * result after its first ResizeObserver delivery.
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
  const matchesRef = useRef<boolean | null>(null);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  const { minWidth, maxWidth, minHeight, maxHeight } = breakpoint;

  useElementEffect(
    ref,
    (element) => {
      matchesRef.current = null;

      return observeResize(element, (entry) => {
        if (entry.target !== ref.current) return;

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

        // Dedupe resize deliveries within this subscription.
        if (nowMatches !== matchesRef.current) {
          matchesRef.current = nowMatches;
          setMatches(nowMatches);
        }
      });
    },
    [minWidth, maxWidth, minHeight, maxHeight],
  );

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
