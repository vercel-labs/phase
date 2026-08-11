import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from 'react';

import { subscribeDpr, readDpr } from '../../core/_internal/pool/dpr';
import { observeResize } from '../../core/_internal/pool/ro-pool';
import {
  createLoop,
  type LoopPhase,
  type LoopReason,
  type LoopReducedMotion,
  type Quality,
  type DegradedBehavior,
  type DegradedReason,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { useSyncedRef } from '../use-synced-ref';

export interface Size {
  width: number;
  height: number;
}

/**
 * Per-frame canvas draw callback. Receives the 2D context, frame state, and
 * current element size. Draw directly to the canvas. Never call React
 * `setState` here.
 */
export type CanvasDrawFn = (
  ctx: CanvasRenderingContext2D,
  frame: FrameState,
  size: Size,
) => void;

export interface UseCanvasOptions {
  containerRef: RefObject<Element | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * Called every frame with the 2D context, frame state, and current element size.
   * Draw directly to the canvas. Never call React `setState` here.
   */
  draw: CanvasDrawFn;
  fps?: number;
  enabled?: boolean;
  /** Behavior when the user prefers reduced motion. Default `'pause'` (paints one static frame). */
  reducedMotion?: LoopReducedMotion;
  /** Behavior while the window is unfocused. Default `'pause'`. */
  unfocused?: DegradedBehavior;
  /** Behavior after sustained over-budget frames. Default `'throttle'`. For heavy GPU work, `'pause'` is often the right call. */
  frameBudget?: DegradedBehavior;
  /** FPS cap while any quality signal resolves to `'throttle'`. Default `30`. */
  throttleFps?: number;
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
    unfocused,
    frameBudget,
    throttleFps,
  } = options;
  const drawRef = useSyncedRef(options.draw);

  const [state, setState] = useState(INITIAL_STATE);
  const [restartNonce, setRestartNonce] = useState(0);

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const container: Element | null = containerRef.current;
    const canvasEl: HTMLCanvasElement | null = canvasRef.current;
    if (!container || !canvasEl || !enabled) return;
    const canvas: HTMLCanvasElement = canvasEl;

    const initialCtx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!initialCtx) return;
    ctxRef.current = initialCtx;

    let dpr: number = readDpr();
    let contextLost = false;
    let loopInstance: ReturnType<typeof createLoop> | null = null;

    // --- Canvas buffer sizing ---

    function applySize(
      width: number,
      height: number,
      physicalBox?: ResizeObserverSize,
    ): void {
      sizeRef.current = { width, height };
      // Downscale the buffer only while degraded output is actually being
      // produced. A paused-but-degraded loop (e.g. blurred window) keeps the
      // full-res buffer so the resume frame is crisp.
      const isDegraded: boolean =
        loopInstance?.quality === 'degraded' &&
        loopInstance.phase === 'running';

      let bufferWidth: number;
      let bufferHeight: number;

      if (isDegraded) {
        bufferWidth = width;
        bufferHeight = height;
      } else if (physicalBox) {
        bufferWidth = physicalBox.inlineSize;
        bufferHeight = physicalBox.blockSize;
      } else {
        bufferWidth = width * dpr;
        bufferHeight = height * dpr;
      }

      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const effectiveDpr: number = isDegraded ? 1 : dpr;
      ctxRef.current?.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
    }

    // --- DPR monitoring (e.g. user drags window between monitors) ---

    const unsubDpr: () => void = subscribeDpr((newDpr) => {
      dpr = newDpr;
      applySize(sizeRef.current.width, sizeRef.current.height);
    });

    // --- Resize via shared RO pool ---

    const unobserve: () => void = observeResize(container, (entry) => {
      const box = entry.contentBoxSize[0];
      if (!box) return;
      const physicalBox: ResizeObserverSize | undefined =
        entry.devicePixelContentBoxSize?.[0];
      applySize(box.inlineSize, box.blockSize, physicalBox);
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

    const loop = createLoop({
      element: container,
      fps,
      reducedMotion,
      unfocused,
      frameBudget,
      throttleFps,
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
    }

    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    fps,
    reducedMotion,
    unfocused,
    frameBudget,
    throttleFps,
    restartNonce,
  ]);

  // Restart bumps a nonce so the effect re-runs: it tears down the current
  // loop + observers and rebuilds them on the next cycle.
  const restart = useCallback(() => {
    setRestartNonce((n) => n + 1);
  }, []);

  return { restart, ...state };
}
