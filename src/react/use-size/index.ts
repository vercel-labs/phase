import { useState, useEffect, useRef, type RefObject } from 'react';

import { observeResize } from '../../core/_internal/pool/ro-pool';

export interface Size {
  width: number;
  height: number;
}

export interface UseSizeOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to measure. Optional. When omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
}

export interface UseSizeResult<T extends Element = HTMLDivElement> {
  /** Attach to the element you want to measure. */
  ref: RefObject<T | null>;
  /** Element dimensions, or `null` until the first observation. */
  size: Size | null;
}

/**
 * Element dimensions via the shared ResizeObserver singleton.
 *
 * `size` is `null` until the first observation. Never calls `getBoundingClientRect()`.
 * RO callbacks are compositor-aligned (once per frame), so no rAF coalescing needed.
 *
 * @example
 * const { ref, size } = useSize();
 * return <div ref={ref}>{size?.width}</div>;
 */
export function useSize<T extends Element = HTMLDivElement>(
  options?: UseSizeOptions<T>,
): UseSizeResult<T> {
  const [size, setSize] = useState<Size | null>(null);
  const prevWidth = useRef<number | null>(null);
  const prevHeight = useRef<number | null>(null);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    const unobserve: () => void = observeResize(element, (entry) => {
      const box = entry.contentBoxSize[0];
      if (!box) return;

      const width: number = box.inlineSize;
      const height: number = box.blockSize;

      // Skip setState if dimensions haven't changed — avoids entering the
      // component at all, vs React's bailout which still calls the function.
      if (width === prevWidth.current && height === prevHeight.current) return;
      prevWidth.current = width;
      prevHeight.current = height;

      setSize({ width, height });
    });

    return unobserve;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, size };
}
