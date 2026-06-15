import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from 'react';

import { observeResize } from '../../core/_internal/pool/ro-pool';
import {
  createLoop,
  type LoopPhase,
  type LoopReason,
  type Quality,
  type DegradedReason,
  type ReducedMotionBehavior,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { useSyncedRef } from '../use-synced-ref';

export interface Size {
  width: number;
  height: number;
}

export interface UseCanvasOptions {
  containerRef: RefObject<Element | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * Called every frame with the 2D context, frame state, and current element size.
   * Draw directly to the canvas — never call React `setState` here.
   */
  draw: (ctx: CanvasRenderingContext2D, frame: FrameState, size: Size) => void;
  fps?: number;
  enabled?: boolean;
  reducedMotion?: ReducedMotionBehavior;
}

export interface UseCanvasResult {
  restart: () => void;
  phase: LoopPhase;
  phaseReason: LoopReason;
  quality: Quality;
  qualityReason: DegradedReason | undefined;
}

const INITIAL_STATE: Omit<UseCanvasResult, 'restart'> = {
  phase: 'idle',
  phaseReason: 'initial',
  quality: 'full',
  qualityReason: undefined,
};

/**
 * Canvas-specific animation with DPR-aware sizing, ResizeObserver coalescing,
 * context management, and GPU context loss recovery.
 *
 * @example
 * useCanvas({
 *   containerRef,
 *   canvasRef,
 *   draw: (ctx, frame, size) => {
 *     ctx.clearRect(0, 0, size.width, size.height);
 *     // render...
 *   },
 * });
 */
export function useCanvas(options: UseCanvasOptions): UseCanvasResult {
  const {
    containerRef,
    canvasRef,
    fps,
    enabled = true,
    reducedMotion,
  } = options;
  const drawRef = useSyncedRef(options.draw);

  const [state, setState] = useState(INITIAL_STATE);

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const qualityRef = useSyncedRef(state.quality);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container: Element | null = containerRef.current;
    const canvasEl: HTMLCanvasElement | null = canvasRef.current;
    if (!container || !canvasEl || !enabled) return;
    const canvas: HTMLCanvasElement = canvasEl;

    const initialCtx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!initialCtx) return;
    ctxRef.current = initialCtx;

    let dpr: number = window.devicePixelRatio || 1;
    let contextLost = false;

    // --- Canvas buffer sizing ---

    function applySize(width: number, height: number): void {
      sizeRef.current = { width, height };
      // Under degraded quality, drop to 1x DPR to halve GPU pixel count.
      const effectiveDpr: number = qualityRef.current === 'degraded' ? 1 : dpr;
      canvas.width = width * effectiveDpr;
      canvas.height = height * effectiveDpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctxRef.current?.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
    }

    // --- DPR monitoring (e.g. user drags window between monitors) ---

    const unsubDpr: () => void = subscribeDprChanges(dpr, (newDpr) => {
      dpr = newDpr;
      applySize(sizeRef.current.width, sizeRef.current.height);
    });

    // --- Resize via shared RO pool ---

    const unobserve: () => void = observeResize(container, (entry) => {
      const box = entry.contentBoxSize[0];
      if (box) applySize(box.inlineSize, box.blockSize);
    });

    // --- GPU context loss recovery ---

    function onContextLost(event: Event): void {
      event.preventDefault();
      contextLost = true;
    }

    function onContextRestored(): void {
      const restoredCtx: CanvasRenderingContext2D | null =
        canvas.getContext('2d');
      if (!restoredCtx) return;
      ctxRef.current = restoredCtx;
      contextLost = false;
      applySize(sizeRef.current.width, sizeRef.current.height);
    }

    canvas.addEventListener('contextlost', onContextLost);
    canvas.addEventListener('contextrestored', onContextRestored);

    // --- Animation loop ---

    let loopInstance: ReturnType<typeof createLoop> | null = null;

    const loop = createLoop({
      element: container,
      fps,
      reducedMotion,
      onTick: (frame) => {
        if (contextLost || !ctxRef.current) return;
        drawRef.current(ctxRef.current, frame, sizeRef.current);
      },
      onPhaseChange: (phase, reason) => {
        setState({
          phase,
          phaseReason: reason,
          quality: loopInstance?.quality ?? 'full',
          qualityReason: loopInstance?.qualityReason,
        });
      },
    });
    loopInstance = loop;

    // --- Teardown ---

    function teardown(): void {
      loop.stop();
      loopInstance = null;
      unobserve();
      unsubDpr();
      canvas.removeEventListener('contextlost', onContextLost);
      canvas.removeEventListener('contextrestored', onContextRestored);
      teardownRef.current = null;
    }

    teardownRef.current = teardown;
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fps, reducedMotion]);

  // Restart tears down and lets the next effect cycle rebuild everything.
  const restart = useCallback(() => {
    teardownRef.current?.();
  }, []);

  return { restart, ...state };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Listen for devicePixelRatio changes via matchMedia (e.g. monitor switch). */
function subscribeDprChanges(
  initialDpr: number,
  onChange: (dpr: number) => void,
): () => void {
  const query: MediaQueryList = matchMedia(`(resolution: ${initialDpr}dppx)`);
  function handler(): void {
    onChange(window.devicePixelRatio || 1);
  }
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}
