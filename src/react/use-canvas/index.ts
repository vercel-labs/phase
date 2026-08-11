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
  type Quality,
  type DegradedBehavior,
  type DegradedReason,
  type ReducedMotionBehavior,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { degradedConfig } from '../_internal/degraded-config';
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
  reducedMotion?: ReducedMotionBehavior;
  /** Behavior when quality degrades. Default `'throttle'`. For heavy GPU work, `'pause'` is often the right call. */
  degraded?: DegradedBehavior;
  /** FPS cap when `degraded` is `'throttle'`. Default `30`. */
  degradedFps?: number;
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
    degraded,
    degradedFps,
  } = options;
  const drawRef = useSyncedRef(options.draw);

  const [state, setState] = useState(INITIAL_STATE);
  const [restartNonce, setRestartNonce] = useState(0);

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const qualityRef = useSyncedRef(state.quality);

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

    // --- Canvas buffer sizing ---

    function applySize(
      width: number,
      height: number,
      physicalBox?: ResizeObserverSize,
    ): void {
      sizeRef.current = { width, height };
      const isDegraded: boolean = qualityRef.current === 'degraded';

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

    let loopInstance: ReturnType<typeof createLoop> | null = null;

    const loop = createLoop({
      element: container,
      fps,
      reducedMotion,
      ...degradedConfig(degraded, degradedFps),
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
  }, [enabled, fps, reducedMotion, degraded, degradedFps, restartNonce]);

  // Restart bumps a nonce so the effect re-runs: it tears down the current
  // loop + observers and rebuilds them on the next cycle.
  const restart = useCallback(() => {
    setRestartNonce((n) => n + 1);
  }, []);

  return { restart, ...state };
}
