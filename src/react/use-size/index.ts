import { useState, useEffect, useRef, type RefObject } from 'react';

import { observeResize } from '../../core/_internal/pool/ro-pool';

export interface Size {
  width: number;
  height: number;
}

/**
 * Element dimensions via the shared ResizeObserver singleton.
 *
 * Returns `null` until the first observation. Never calls `getBoundingClientRect()`.
 * RO callbacks are already compositor-aligned (once per frame) — no additional
 * rAF coalescing needed.
 *
 * @example
 * const size = useSize(containerRef);
 * if (size) console.log(size.width, size.height);
 */
export function useSize(ref: RefObject<Element | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  const prevWidth = useRef<number | null>(null);
  const prevHeight = useRef<number | null>(null);

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
  }, [ref]);

  return size;
}
