import { useState, useEffect, useRef, type RefObject } from 'react';

import { observeResize } from '../../core/_internal/pool/ro-pool';
import { useSyncedRef } from '../use-synced-ref';

export type SizeCallback = (size: Size) => void;

export interface Size {
  width: number;
  height: number;
}

export interface UseSizeOptions<T extends Element = HTMLDivElement> {
  /**
   * Element to measure. Optional. When omitted, attach the returned `ref`.
   */
  ref?: RefObject<T | null>;
  /**
   * Called on every resize. When provided, `size` stays `null` and no
   * re-renders occur, making this the right path for canvas and animation
   * consumers that read dimensions imperatively.
   */
  onResize?: SizeCallback;
}

export interface UseSizeResult<T extends Element = HTMLDivElement> {
  /** Attach to the element you want to measure. */
  ref: RefObject<T | null>;
  /** Element dimensions via state, or `null` until first observation. Always `null` when `onResize` is provided. */
  size: Size | null;
  /** Element dimensions via ref. Always current regardless of mode. */
  sizeRef: RefObject<Size | null>;
}

/**
 * Element dimensions via the shared ResizeObserver singleton.
 *
 * Pass `onResize` for zero-re-render mode (canvas, animation loops).
 * Without it, `size` updates via state on every dimension change.
 * `sizeRef` is always current in both modes.
 *
 * @example
 * // Reactive (re-renders on resize)
 * const { ref, size } = useSize();
 *
 * // Transient (no re-renders — read sizeRef in onTick/draw)
 * const { ref, sizeRef } = useSize({ onResize: (s) => applySize(s) });
 */
export function useSize<T extends Element = HTMLDivElement>(
  options?: UseSizeOptions<T>,
): UseSizeResult<T> {
  const [size, setSize] = useState<Size | null>(null);
  const sizeRef = useRef<Size | null>(null);
  const prevWidth = useRef<number | null>(null);
  const prevHeight = useRef<number | null>(null);
  const onResizeRef = useSyncedRef(options?.onResize);

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

      if (width === prevWidth.current && height === prevHeight.current) return;
      prevWidth.current = width;
      prevHeight.current = height;

      const next: Size = { width, height };
      sizeRef.current = next;

      if (onResizeRef.current) {
        onResizeRef.current(next);
      } else {
        setSize(next);
      }
    });

    return unobserve;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, size, sizeRef };
}
