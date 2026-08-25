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
   * Which CSS box model to measure. `'content-box'` returns the content area
   * (inside padding). `'border-box'` returns content + padding + border.
   * Default `'content-box'`.
   */
  box?: 'content-box' | 'border-box';
  /**
   * Called on every resize. When provided, `size` is omitted from the return
   * type and no re-renders occur, the right path for canvas and animation
   * consumers that read dimensions imperatively.
   */
  onResize?: SizeCallback;
}

export interface UseSizeReactiveResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  /** Element dimensions via state, or `null` until first observation. */
  size: Size | null;
  /** Element dimensions via ref. Always current, never triggers re-render. */
  sizeRef: RefObject<Size | null>;
}

export interface UseSizeTransientResult<T extends Element = HTMLDivElement> {
  ref: RefObject<T | null>;
  /** Element dimensions via ref. Always current, never triggers re-render. */
  sizeRef: RefObject<Size | null>;
}

/** @deprecated Use `UseSizeReactiveResult` or `UseSizeTransientResult`. */
export type UseSizeResult<T extends Element = HTMLDivElement> =
  UseSizeReactiveResult<T>;

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
  options: UseSizeOptions<T> & { onResize: SizeCallback },
): UseSizeTransientResult<T>;
export function useSize<T extends Element = HTMLDivElement>(
  options?: UseSizeOptions<T>,
): UseSizeReactiveResult<T>;
export function useSize<T extends Element = HTMLDivElement>(
  options?: UseSizeOptions<T>,
): UseSizeReactiveResult<T> | UseSizeTransientResult<T> {
  const [size, setSize] = useState<Size | null>(null);
  const sizeRef = useRef<Size | null>(null);
  const prevWidth = useRef<number | null>(null);
  const prevHeight = useRef<number | null>(null);
  const onResizeRef = useSyncedRef(options?.onResize);

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options?.ref ?? internalRef;
  const boxOption: 'content-box' | 'border-box' | undefined = options?.box;

  useEffect(() => {
    const element: Element | null = ref.current;
    if (!element) return;

    const unobserve: () => void = observeResize(
      element,
      (entry) => {
        const resolved: ResizeObserverSize | undefined =
          boxOption === 'border-box'
            ? entry.borderBoxSize[0]
            : entry.contentBoxSize[0];
        if (!resolved) return;

        const width: number = resolved.inlineSize;
        const height: number = resolved.blockSize;

        if (width === prevWidth.current && height === prevHeight.current)
          return;
        prevWidth.current = width;
        prevHeight.current = height;

        const next: Size = { width, height };
        sizeRef.current = next;

        if (onResizeRef.current) {
          onResizeRef.current(next);
        } else {
          setSize(next);
        }
      },
      boxOption,
    );

    return unobserve;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxOption]);

  return { ref, size, sizeRef };
}
