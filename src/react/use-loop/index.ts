import { useEffect, useRef, useState, type RefObject } from 'react';

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

export type LoopTickFn = (frame: FrameState) => void;

export interface UseLoopOptions<T extends Element = HTMLDivElement> {
  /** Element to observe. When omitted, attach the returned `ref`. */
  ref?: RefObject<T | null>;
  onTick: LoopTickFn;
  fps?: number;
  enabled?: boolean;
  reducedMotion?: LoopReducedMotion;
  unfocused?: DegradedBehavior;
  slowFrames?: DegradedBehavior;
  throttleFps?: number;
  intersectionOptions?: IntersectionObserverInit;
  /**
   * Transient quality notification. When supplied, quality transitions do not
   * trigger React renders; read `qualityRef.current`.
   */
  onQualityChange?: QualityChangeCallback;
}

interface UseLoopBaseResult<T extends Element> {
  ref: RefObject<T | null>;
  phase: LoopPhase;
  phaseReason: LoopReason;
  /** Always-current quality state. Never triggers a render. */
  qualityRef: RefObject<LoopQuality>;
}

export interface UseLoopReactiveResult<
  T extends Element = HTMLDivElement,
> extends UseLoopBaseResult<T> {
  /** Reactive quality state. */
  quality: LoopQuality;
}

export type UseLoopTransientResult<T extends Element = HTMLDivElement> =
  UseLoopBaseResult<T>;

/** @deprecated Use `UseLoopReactiveResult` or `UseLoopTransientResult`. */
export type UseLoopResult<T extends Element = HTMLDivElement> =
  UseLoopReactiveResult<T>;

type LoopState = {
  phase: LoopPhase;
  phaseReason: LoopReason;
};

const INITIAL_STATE: LoopState = {
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
 * Ref-based animation loop with reactive phase state and no per-frame renders.
 *
 * Quality is reactive by default. Supplying `onQualityChange` switches quality
 * to transient mode while `qualityRef` remains current in both modes.
 */
export function useLoop<T extends Element = HTMLDivElement>(
  options: UseLoopOptions<T> & { onQualityChange: QualityChangeCallback },
): UseLoopTransientResult<T>;
export function useLoop<T extends Element = HTMLDivElement>(
  options: UseLoopOptions<T>,
): UseLoopReactiveResult<T>;
export function useLoop<T extends Element = HTMLDivElement>(
  options: UseLoopOptions<T>,
): UseLoopReactiveResult<T> | UseLoopTransientResult<T> {
  const {
    fps,
    enabled = true,
    reducedMotion,
    unfocused,
    slowFrames,
    throttleFps,
    intersectionOptions,
  } = options;
  const onTickRef = useSyncedRef(options.onTick);
  const onQualityChangeRef = useSyncedRef(options.onQualityChange);
  const transientQuality = options.onQualityChange !== undefined;
  const intersectionRoot = intersectionOptions?.root;
  const intersectionRootMargin = intersectionOptions?.rootMargin;
  const intersectionThreshold = intersectionOptions?.threshold;
  const intersectionThresholdKey = Array.isArray(intersectionThreshold)
    ? intersectionThreshold.join(',')
    : intersectionThreshold;

  const internalRef = useRef<T | null>(null);
  const ref: RefObject<T | null> = options.ref ?? internalRef;
  const [element, setElement] = useState<T | null>(() => ref.current);
  const [state, setState] = useState<LoopState>(INITIAL_STATE);
  const [quality, setQuality] = useState<LoopQuality>(INITIAL_QUALITY);
  const qualityRef = useRef<LoopQuality>(INITIAL_QUALITY);

  // Object refs do not notify React when their node changes. Check after every
  // commit and perform one reconciliation render only when identity changed.
  useEffect(() => {
    if (element !== ref.current) setElement(ref.current);
  });

  useEffect(() => {
    if (transientQuality) return;
    setQuality(qualityRef.current);
  }, [transientQuality]);

  useEffect(() => {
    qualityRef.current = INITIAL_QUALITY;
    if (!transientQuality) setQuality(INITIAL_QUALITY);

    if (!element || !enabled) {
      setState(INITIAL_STATE);
      return;
    }

    const loop = createLoop({
      element,
      onTick: (frame) => onTickRef.current(frame),
      fps,
      reducedMotion,
      unfocused,
      slowFrames,
      throttleFps,
      intersectionOptions,
      onPhaseChange: (phase, reason) => {
        setState({ phase, phaseReason: reason });
      },
      onQualityChange: (nextQuality) => {
        qualityRef.current = nextQuality;
        if (onQualityChangeRef.current) {
          onQualityChangeRef.current(nextQuality);
        } else {
          setQuality(nextQuality);
        }
      },
    });

    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    element,
    enabled,
    fps,
    reducedMotion,
    unfocused,
    slowFrames,
    throttleFps,
    intersectionRoot,
    intersectionRootMargin,
    intersectionThresholdKey,
  ]);

  const base: UseLoopBaseResult<T> = {
    ref,
    ...state,
    qualityRef,
  };
  return transientQuality ? base : { ...base, quality };
}
