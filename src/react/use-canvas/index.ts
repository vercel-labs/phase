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
  type QualityChangeCallback,
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
  /** Base FPS cap. Default: uncapped (display refresh rate). */
  fps?: number;
  /** When `false`, tears down the canvas lifecycle and reports `idle`. Default `true`. */
  enabled?: boolean;
  /** Behavior when the user prefers reduced motion. Default `'pause'` (one static frame per buffer creation). */
  reducedMotion?: LoopReducedMotion;
  /**
   * Behavior while `document.hasFocus()` is false. Default `'pause'`.
   * Offscreen/background-tab visibility is separate and always pauses.
   */
  unfocused?: DegradedBehavior;
  /**
   * Behavior after three consecutive frames exceed 1.5x the current target
   * interval. Default `'throttle'`. For heavy GPU work, `'pause'` is often right.
   */
  frameBudget?: DegradedBehavior;
  /** Shared throttle cap; never raises a lower `fps` cap. Default `30`. */
  throttleFps?: number;
  /** Options forwarded to the pooled visibility observer. Value changes rebuild the loop. */
  intersectionOptions?: IntersectionObserverInit;
  /** Transient quality notification. Does not trigger a React render. */
  onQualityChange?: QualityChangeCallback;
}

export interface UseCanvasResult {
  restart: () => void;
  phase: LoopPhase;
  phaseReason: LoopReason;
  /**
   * Always-current quality state, read through a getter: access it where you
   * need it (`result.quality`) rather than destructuring, which snapshots the
   * value. Quality changes never trigger a render; use `onQualityChange` to be
   * notified.
   */
  quality: Quality;
  /** Active signal; `'unfocused'` has reporting priority when both are active. */
  qualityReason: DegradedReason | undefined;
  /** Resolved behavior after applying pause > throttle > ignore precedence. */
  qualityBehavior: DegradedBehavior | undefined;
}

type CanvasState = Pick<UseCanvasResult, 'phase' | 'phaseReason'>;

const INITIAL_STATE: CanvasState = {
  phase: 'idle',
  phaseReason: 'initial',
};

/**
 * Canvas-specific animation with DPR-aware sizing, ResizeObserver coalescing,
 * context management, and GPU context loss recovery.
 *
 * Under reduced motion the loop delivers no frames; the canvas paints one
 * static frame (zero timeline) each time its buffer is created or resized, so
 * it is never left blank.
 *
 * @example
 * const { qualityReason, qualityBehavior } = useCanvas({
 *   containerRef,
 *   canvasRef,
 *   draw: (ctx, frame, size) => {
 *     ctx.clearRect(0, 0, size.width, size.height);
 *     // render...
 *   },
 * });
 * // A throttling quality signal also lowers the canvas buffer to 1x DPR.
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
    intersectionOptions,
  } = options;
  const drawRef = useSyncedRef(options.draw);
  const onQualityChangeRef = useSyncedRef(options.onQualityChange);
  const intersectionRoot = intersectionOptions?.root;
  const intersectionRootMargin = intersectionOptions?.rootMargin;
  const intersectionThreshold = intersectionOptions?.threshold;
  const intersectionThresholdKey = Array.isArray(intersectionThreshold)
    ? intersectionThreshold.join(',')
    : intersectionThreshold;

  const [state, setState] = useState<CanvasState>(INITIAL_STATE);
  const [restartNonce, setRestartNonce] = useState(0);

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const qualityRef = useRef<Quality>('full');
  const qualityReasonRef = useRef<DegradedReason | undefined>(undefined);
  const qualityBehaviorRef = useRef<DegradedBehavior | undefined>(undefined);

  useEffect(() => {
    const container: Element | null = containerRef.current;
    const canvasEl: HTMLCanvasElement | null = canvasRef.current;
    if (!container || !canvasEl || !enabled) {
      setState(INITIAL_STATE);
      qualityRef.current = 'full';
      qualityReasonRef.current = undefined;
      qualityBehaviorRef.current = undefined;
      return;
    }
    const canvas: HTMLCanvasElement = canvasEl;

    const initialCtx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!initialCtx) return;
    ctxRef.current = initialCtx;

    let dpr: number = readDpr();
    let contextLost = false;
    let loopInstance: ReturnType<typeof createLoop> | null = null;

    // A paused loop delivers no frames, so the reduced-motion paint supplies a
    // zero timeline. Owned per instance: a consumer that mutates the frame it
    // receives cannot corrupt another canvas.
    const staticFrame: FrameState = { time: 0, delta: 0, elapsed: 0, frame: 0 };

    // --- Canvas buffer sizing ---

    // Last applied buffer state. Assigning canvas.width/height clears the
    // bitmap and resets context state even with the same value, so redundant
    // re-applies (phase flips, repeated quality events) must be skipped.
    let bufferWidth = 0;
    let bufferHeight = 0;
    let appliedDpr = 0;
    // Last exact physical box from ResizeObserver, preserved across quality
    // transitions so full-resolution restores don't fall back to width * dpr.
    let physicalWidth = 0;
    let physicalHeight = 0;

    // The loop delivers zero frames while paused for reduced motion, so paint
    // the initial state once per buffer (re)creation: never a blank canvas,
    // and a resize while paused repaints at the new size.
    function drawStaticFrame(): void {
      if (loopInstance?.phaseReason !== 'reduced-motion') return;
      if (loopInstance.phase !== 'paused') return;
      if (contextLost || !ctxRef.current) return;
      drawRef.current(ctxRef.current, staticFrame, sizeRef.current);
    }

    function applySize(width: number, height: number): void {
      sizeRef.current.width = width;
      sizeRef.current.height = height;

      // Downscale to 1x only while the resolved behavior is throttling.
      // Paused and ignored signals keep full resolution.
      const throttled: boolean = loopInstance?.qualityBehavior === 'throttle';

      let nextWidth: number;
      let nextHeight: number;
      if (throttled) {
        nextWidth = width;
        nextHeight = height;
      } else if (physicalWidth > 0) {
        nextWidth = physicalWidth;
        nextHeight = physicalHeight;
      } else {
        nextWidth = width * dpr;
        nextHeight = height * dpr;
      }
      const nextDpr: number = throttled ? 1 : dpr;

      if (
        nextWidth === bufferWidth &&
        nextHeight === bufferHeight &&
        nextDpr === appliedDpr
      ) {
        return;
      }
      bufferWidth = nextWidth;
      bufferHeight = nextHeight;
      appliedDpr = nextDpr;

      canvas.width = nextWidth;
      canvas.height = nextHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctxRef.current?.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
      drawStaticFrame();
    }

    // --- DPR monitoring (e.g. user drags window between monitors) ---

    const unsubDpr: () => void = subscribeDpr((newDpr) => {
      dpr = newDpr;
      // The cached physical box belongs to the previous density; fall back to
      // width * dpr until ResizeObserver reports fresh physical pixels.
      physicalWidth = 0;
      physicalHeight = 0;
      applySize(sizeRef.current.width, sizeRef.current.height);
    });

    // --- Resize via shared RO pool ---

    const unobserve: () => void = observeResize(container, (entry) => {
      const box = entry.contentBoxSize[0];
      if (!box) return;
      const physicalBox: ResizeObserverSize | undefined =
        entry.devicePixelContentBoxSize?.[0];
      physicalWidth = physicalBox ? physicalBox.inlineSize : 0;
      physicalHeight = physicalBox ? physicalBox.blockSize : 0;
      applySize(box.inlineSize, box.blockSize);
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
      // The bitmap and context state were lost; force a full re-apply even
      // when the computed dimensions are unchanged.
      bufferWidth = 0;
      bufferHeight = 0;
      appliedDpr = 0;
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
      intersectionOptions,
      onTick: (frame) => {
        if (contextLost || !ctxRef.current) return;
        drawRef.current(ctxRef.current, frame, sizeRef.current);
      },
      onPhaseChange: (phase, reason) => {
        setState({ phase, phaseReason: reason });
      },
      onQualityChange: (quality, qualityReason, qualityBehavior) => {
        qualityRef.current = quality;
        qualityReasonRef.current = qualityReason;
        qualityBehaviorRef.current = qualityBehavior;
        onQualityChangeRef.current?.(quality, qualityReason, qualityBehavior);
        // Buffer resolution follows the resolved behavior (throttle = 1x).
        applySize(sizeRef.current.width, sizeRef.current.height);
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
    intersectionRoot,
    intersectionRootMargin,
    intersectionThresholdKey,
    restartNonce,
  ]);

  // Restart bumps a nonce so the effect re-runs: it tears down the current
  // loop + observers and rebuilds them on the next cycle.
  const restart = useCallback(() => {
    setRestartNonce((n) => n + 1);
  }, []);

  return {
    restart,
    ...state,
    get quality() {
      return qualityRef.current;
    },
    get qualityReason() {
      return qualityReasonRef.current;
    },
    get qualityBehavior() {
      return qualityBehaviorRef.current;
    },
  };
}
