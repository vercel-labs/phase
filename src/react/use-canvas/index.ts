import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { readDpr, subscribeDpr } from '../../core/_internal/pool/dpr';
import { observeResize } from '../../core/_internal/pool/ro-pool';
import {
  createLoop,
  type DegradedBehavior,
  type LoopPhase,
  type LoopQuality,
  type LoopReason,
  type LoopReducedMotion,
  type QualityChangeCallback,
} from '../../core/loop';
import type { FrameState } from '../../core/tick';
import { useSyncedRef } from '../use-synced-ref';

export interface Size {
  readonly width: number;
  readonly height: number;
}

type MutableSize = {
  -readonly [Key in keyof Size]: Size[Key];
};

type MutableFrameState = {
  -readonly [Key in keyof FrameState]: FrameState[Key];
};

export type CanvasDrawFn = (
  ctx: CanvasRenderingContext2D,
  frame: FrameState,
  size: Size,
) => void;

export interface UseCanvasOptions {
  containerRef: RefObject<Element | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  draw: CanvasDrawFn;
  fps?: number;
  enabled?: boolean;
  reducedMotion?: LoopReducedMotion;
  unfocused?: DegradedBehavior;
  slowFrames?: DegradedBehavior;
  throttleFps?: number;
  intersectionOptions?: IntersectionObserverInit;
  /**
   * `'adaptive'` uses 1x while slow-frame pressure is active. Focus throttling
   * never changes resolution. Default `'adaptive'`.
   */
  pixelRatio?: 'adaptive' | 'device';
  /**
   * Transient quality notification. When supplied, quality transitions do not
   * trigger React renders; read `qualityRef.current`.
   */
  onQualityChange?: QualityChangeCallback;
}

interface UseCanvasBaseResult {
  restart: () => void;
  phase: LoopPhase;
  phaseReason: LoopReason;
  qualityRef: RefObject<LoopQuality>;
}

export interface UseCanvasReactiveResult extends UseCanvasBaseResult {
  quality: LoopQuality;
}

export type UseCanvasTransientResult = UseCanvasBaseResult;

/** @deprecated Use `UseCanvasReactiveResult` or `UseCanvasTransientResult`. */
export type UseCanvasResult = UseCanvasReactiveResult;

type CanvasState = Pick<UseCanvasBaseResult, 'phase' | 'phaseReason'>;

const INITIAL_STATE: CanvasState = {
  phase: 'idle',
  phaseReason: 'initial',
};

const INITIAL_QUALITY: LoopQuality = Object.freeze({
  status: 'full',
  signals: Object.freeze({
    unfocused: false,
    slowFrames: undefined,
  }),
  action: undefined,
});

/**
 * Canvas animation with lifecycle gating, exact buffer sizing, adaptive pixel
 * ratio, context recovery, and repaint-safe strong pauses.
 */
export function useCanvas(
  options: UseCanvasOptions & { onQualityChange: QualityChangeCallback },
): UseCanvasTransientResult;
export function useCanvas(options: UseCanvasOptions): UseCanvasReactiveResult;
export function useCanvas(
  options: UseCanvasOptions,
): UseCanvasReactiveResult | UseCanvasTransientResult {
  const {
    containerRef,
    canvasRef,
    fps,
    enabled = true,
    reducedMotion,
    unfocused,
    slowFrames,
    throttleFps,
    intersectionOptions,
    pixelRatio = 'adaptive',
  } = options;
  const drawRef = useSyncedRef(options.draw);
  const onQualityChangeRef = useSyncedRef(options.onQualityChange);
  const transientQuality = options.onQualityChange !== undefined;
  const intersectionRoot = intersectionOptions?.root;
  const intersectionRootMargin = intersectionOptions?.rootMargin;
  const intersectionThreshold = intersectionOptions?.threshold;
  const intersectionThresholdKey = Array.isArray(intersectionThreshold)
    ? intersectionThreshold.join(',')
    : intersectionThreshold;

  const [container, setContainer] = useState<Element | null>(
    () => containerRef.current,
  );
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(
    () => canvasRef.current,
  );
  const [state, setState] = useState<CanvasState>(INITIAL_STATE);
  const [quality, setQuality] = useState<LoopQuality>(INITIAL_QUALITY);
  const [restartNonce, setRestartNonce] = useState(0);
  const qualityRef = useRef<LoopQuality>(INITIAL_QUALITY);

  useEffect(() => {
    if (container !== containerRef.current) setContainer(containerRef.current);
    if (canvas !== canvasRef.current) setCanvas(canvasRef.current);
  });

  useEffect(() => {
    if (transientQuality) return;
    setQuality(qualityRef.current);
  }, [transientQuality]);

  useEffect(() => {
    qualityRef.current = INITIAL_QUALITY;
    if (!transientQuality) setQuality(INITIAL_QUALITY);

    if (!container || !canvas || !enabled) {
      setState(INITIAL_STATE);
      return;
    }

    const mountedCanvas: HTMLCanvasElement = canvas;
    let context: CanvasRenderingContext2D | null =
      mountedCanvas.getContext('2d');
    if (!context) return;

    let dpr: number = readDpr();
    let contextLost = false;
    let visible = false;
    let pendingBuffer = false;
    let hasDrawnFrame = false;
    let currentPhase: LoopPhase = 'idle';
    let currentReason: LoopReason = 'initial';
    let cssWidth = 0;
    let cssHeight = 0;
    let physicalWidth = 0;
    let physicalHeight = 0;
    let bufferWidth = -1;
    let bufferHeight = -1;
    let appliedCssWidth = -1;
    let appliedCssHeight = -1;
    let appliedScaleX = -1;
    let appliedScaleY = -1;

    // `lastTick` is private. `size` and `repaintFrame` are handed to the
    // consumer, so both are restamped from private state before every draw:
    // a consumer that writes through them cannot corrupt a later repaint.
    const lastTick: MutableFrameState = {
      time: 0,
      delta: 0,
      elapsed: 0,
      frame: 0,
    };
    const size: MutableSize = { width: 0, height: 0 };
    const repaintFrame: MutableFrameState = {
      time: 0,
      delta: 0,
      elapsed: 0,
      frame: 0,
    };
    Object.seal(lastTick);
    Object.seal(size);
    Object.seal(repaintFrame);

    function stampSize(): void {
      size.width = cssWidth;
      size.height = cssHeight;
    }

    function stampRepaintFrame(): void {
      stampSize();
      repaintFrame.time = lastTick.time;
      repaintFrame.delta = lastTick.delta;
      repaintFrame.elapsed = lastTick.elapsed;
      repaintFrame.frame = lastTick.frame;
    }

    function adaptiveResolution(): boolean {
      return (
        pixelRatio === 'adaptive' &&
        qualityRef.current.signals.slowFrames !== undefined
      );
    }

    function paintPausedBuffer(reason: LoopReason): void {
      if (currentPhase !== 'paused' || !visible || contextLost || !context) {
        return;
      }
      if (
        reason !== 'reduced-motion' &&
        reason !== 'unfocused' &&
        reason !== 'slow-frames'
      ) {
        return;
      }

      // `lastTick` holds zeros until the first delivered frame, so this is the
      // one zero-timeline frame for a never-started animation.
      stampRepaintFrame();
      drawRef.current(context, repaintFrame, size);
    }

    function paintRecreatedBuffer(): void {
      if (!visible || contextLost || !context) return;
      if (hasDrawnFrame) {
        stampRepaintFrame();
        drawRef.current(context, repaintFrame, size);
        return;
      }
      paintPausedBuffer(currentReason);
    }

    function applySize(force = false): void {
      stampSize();

      if (!visible) {
        pendingBuffer = true;
        return;
      }
      if (!context || contextLost) {
        pendingBuffer = true;
        return;
      }

      const adaptive: boolean = adaptiveResolution();
      const nextWidth: number = adaptive
        ? Math.round(cssWidth)
        : physicalWidth > 0
          ? physicalWidth
          : Math.round(cssWidth * dpr);
      const nextHeight: number = adaptive
        ? Math.round(cssHeight)
        : physicalHeight > 0
          ? physicalHeight
          : Math.round(cssHeight * dpr);
      const scaleX: number = cssWidth > 0 ? nextWidth / cssWidth : 1;
      const scaleY: number = cssHeight > 0 ? nextHeight / cssHeight : 1;

      if (
        !force &&
        nextWidth === bufferWidth &&
        nextHeight === bufferHeight &&
        cssWidth === appliedCssWidth &&
        cssHeight === appliedCssHeight &&
        scaleX === appliedScaleX &&
        scaleY === appliedScaleY
      ) {
        pendingBuffer = false;
        return;
      }

      pendingBuffer = false;
      bufferWidth = nextWidth;
      bufferHeight = nextHeight;
      appliedCssWidth = cssWidth;
      appliedCssHeight = cssHeight;
      appliedScaleX = scaleX;
      appliedScaleY = scaleY;

      mountedCanvas.width = nextWidth;
      mountedCanvas.height = nextHeight;
      mountedCanvas.style.width = `${cssWidth}px`;
      mountedCanvas.style.height = `${cssHeight}px`;
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      paintRecreatedBuffer();
    }

    const unsubDpr: () => void = subscribeDpr((nextDpr) => {
      dpr = nextDpr;
      physicalWidth = 0;
      physicalHeight = 0;
      applySize();
    });

    const unobserve: () => void = observeResize(container, (entry) => {
      const box: ResizeObserverSize | undefined = entry.contentBoxSize[0];
      if (!box) return;
      const physicalBox: ResizeObserverSize | undefined =
        entry.devicePixelContentBoxSize?.[0];
      cssWidth = box.inlineSize;
      cssHeight = box.blockSize;
      physicalWidth = physicalBox ? physicalBox.inlineSize : 0;
      physicalHeight = physicalBox ? physicalBox.blockSize : 0;
      applySize();
    });

    function onContextLost(event: Event): void {
      event.preventDefault();
      contextLost = true;
    }

    function onContextRestored(): void {
      context = mountedCanvas.getContext('2d');
      if (!context) return;
      contextLost = false;
      applySize(true);
    }

    mountedCanvas.addEventListener('contextlost', onContextLost);
    mountedCanvas.addEventListener('contextrestored', onContextRestored);

    let loop: ReturnType<typeof createLoop> | null = null;

    function cleanupResources(): void {
      loop?.stop();
      loop = null;
      unobserve();
      unsubDpr();
      mountedCanvas.removeEventListener('contextlost', onContextLost);
      mountedCanvas.removeEventListener('contextrestored', onContextRestored);
    }

    try {
      loop = createLoop({
        element: container,
        fps,
        reducedMotion,
        unfocused,
        slowFrames,
        throttleFps,
        intersectionOptions,
        onTick: (frame) => {
          if (contextLost || !context) return;
          lastTick.time = frame.time;
          lastTick.delta = frame.delta;
          lastTick.elapsed = frame.elapsed;
          lastTick.frame = frame.frame;
          hasDrawnFrame = true;
          stampSize();
          drawRef.current(context, frame, size);
        },
        onPhaseChange: (phase, reason) => {
          currentPhase = phase;
          currentReason = reason;
          // 'disposed' carries no visibility information. Treating it as
          // visible would allocate a buffer and draw during teardown.
          visible = phase !== 'stopped' && reason !== 'sight';
          setState({ phase, phaseReason: reason });
          const hadPendingBuffer: boolean = pendingBuffer;
          if (visible && hadPendingBuffer) applySize();
          if (phase === 'paused' && !hadPendingBuffer) {
            paintPausedBuffer(reason);
          }
        },
        onQualityChange: (nextQuality) => {
          qualityRef.current = nextQuality;
          applySize();
          // Read the ref, not a captured boolean: the effect does not re-run
          // when the consumer adds or drops `onQualityChange`.
          if (onQualityChangeRef.current) {
            onQualityChangeRef.current(nextQuality);
          } else {
            setQuality(nextQuality);
          }
        },
      });
    } catch (error) {
      cleanupResources();
      throw error;
    }

    return cleanupResources;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    container,
    canvas,
    enabled,
    fps,
    reducedMotion,
    unfocused,
    slowFrames,
    throttleFps,
    intersectionRoot,
    intersectionRootMargin,
    intersectionThresholdKey,
    pixelRatio,
    restartNonce,
  ]);

  const restart = useCallback(() => {
    setRestartNonce((nonce) => nonce + 1);
  }, []);

  const base: UseCanvasBaseResult = {
    restart,
    ...state,
    qualityRef,
  };
  return transientQuality ? base : { ...base, quality };
}
