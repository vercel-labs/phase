import { linkAbortSignal } from '../_internal/abort';
import {
  invalidFpsError,
  noElementError,
  serverContextError,
} from '../_internal/errors';
import {
  readFramePressure,
  subscribeFramePressure,
} from '../_internal/frame-pressure';
import type { FramePressureState } from '../_internal/frame-pressure';
import { readFocus, subscribeFocus } from '../_internal/pool/focus';
import { createLifecycle } from '../lifecycle';
import type { Lifecycle } from '../lifecycle';
import { createTicker } from '../tick';
import type { FrameState, Ticker } from '../tick';

export type LoopReducedMotion = 'pause' | 'ignore';
export type DegradedBehavior = 'throttle' | 'pause' | 'ignore';

export type LoopPhase = 'idle' | 'running' | 'paused' | 'stopped';
export type LoopReason =
  | 'initial'
  | 'started'
  | 'resumed'
  | 'sight'
  | 'reduced-motion'
  | 'unfocused'
  | 'slow-frames'
  | 'disposed';

export type SlowFrameState = Exclude<FramePressureState, 'full'>;

export type QualityAction =
  | { readonly behavior: 'pause' }
  | { readonly behavior: 'ignore' }
  | { readonly behavior: 'throttle'; readonly fps: number };

interface FullQualitySignals {
  readonly unfocused: false;
  readonly slowFrames: undefined;
}

type ActiveQualitySignals =
  | { readonly unfocused: true; readonly slowFrames: undefined }
  | { readonly unfocused: false; readonly slowFrames: SlowFrameState }
  | { readonly unfocused: true; readonly slowFrames: SlowFrameState };

export type LoopQuality =
  | {
      readonly status: 'full';
      readonly signals: FullQualitySignals;
      readonly action: undefined;
    }
  | {
      readonly status: 'degraded';
      readonly signals: ActiveQualitySignals;
      readonly action: QualityAction;
    };

export type QualityChangeCallback = (quality: LoopQuality) => void;

export interface LoopOptions {
  element: Element;
  /**
   * Called every delivered frame. Write to refs or DOM directly. Never call
   * React `setState` here.
   */
  onTick: (frame: FrameState) => void;
  /** Base FPS cap. Must be finite and positive. Default: display refresh rate. */
  fps?: number;
  /** Behavior when the user prefers reduced motion. Default `'pause'`. */
  reducedMotion?: LoopReducedMotion;
  /** Behavior while `document.hasFocus()` is false. Default `'pause'`. */
  unfocused?: DegradedBehavior;
  /**
   * Behavior when the shared rAF clock detects sustained frame pressure.
   * Default `'throttle'`.
   */
  slowFrames?: DegradedBehavior;
  /** FPS cap used by a resolved throttle action. Default `30`. */
  throttleFps?: number;
  /** Options forwarded to the pooled visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Whether to start honoring signals immediately. Default `'auto'`. */
  start?: 'auto' | 'manual';
  /** Called after every completed phase transition. */
  onPhaseChange?: (phase: LoopPhase, reason: LoopReason) => void;
  /** Called after every completed quality transition. */
  onQualityChange?: QualityChangeCallback;
  /** Abort signal that stops the loop. */
  signal?: AbortSignal;
}

export interface Loop {
  start(): void;
  stop(): void;
  readonly phase: LoopPhase;
  readonly phaseReason: LoopReason;
  readonly quality: LoopQuality;
}

const DEFAULT_THROTTLE_FPS = 30;

const FULL_SIGNALS: FullQualitySignals = Object.freeze({
  unfocused: false,
  slowFrames: undefined,
});

const FULL_QUALITY: LoopQuality = Object.freeze({
  status: 'full',
  signals: FULL_SIGNALS,
  action: undefined,
});

function validateFps(
  fn: string,
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) invalidFpsError(fn, value);
  return value;
}

/**
 * Lifecycle-aware animation loop with one persistent, pause-aware ticker.
 *
 * Visibility and reduced motion are lifecycle signals. Window focus and shared
 * frame pressure are independent quality signals whose actions compose with
 * pause > throttle > ignore precedence.
 */
export function createLoop(options: LoopOptions): Loop {
  if (typeof requestAnimationFrame === 'undefined') {
    serverContextError('createLoop');
  }

  const {
    element,
    onTick,
    reducedMotion = 'pause',
    unfocused = 'pause',
    slowFrames = 'throttle',
    intersectionOptions,
    start: startMode = 'auto',
    onPhaseChange,
    onQualityChange,
    signal,
  } = options;

  if (!element) noElementError('createLoop');

  const baseFps: number | undefined = validateFps('createLoop', options.fps);
  const throttleFps: number = validateFps(
    'createLoop',
    options.throttleFps ?? DEFAULT_THROTTLE_FPS,
  ) as number;

  let _phase: LoopPhase = 'idle';
  let _reason: LoopReason = 'initial';
  let _quality: LoopQuality = FULL_QUALITY;
  let intentStarted = false;
  let focusDegraded = !readFocus();
  let pressureState: FramePressureState = readFramePressure();
  let ticker: Ticker | null = null;
  let lifecycle: Lifecycle | null = null;
  let appliedFps: number | undefined;
  let hasAppliedFps = false;
  let unlinkAbort: (() => void) | undefined;
  let unsubFocus: (() => void) | null = null;
  let unsubPressure: (() => void) | null = null;

  function setPhase(phase: LoopPhase, reason: LoopReason): void {
    if (_phase === phase && _reason === reason) return;
    _phase = phase;
    _reason = reason;
    onPhaseChange?.(phase, reason);
  }

  function getSlowFrameBehavior(): DegradedBehavior | undefined {
    if (pressureState === 'degraded') return slowFrames;
    if (pressureState === 'probing') return 'ignore';
    return undefined;
  }

  function getResolvedBehavior(): DegradedBehavior | undefined {
    const focusBehavior: DegradedBehavior | undefined = focusDegraded
      ? unfocused
      : undefined;
    const pressureBehavior: DegradedBehavior | undefined =
      getSlowFrameBehavior();

    if (focusBehavior === 'pause' || pressureBehavior === 'pause')
      return 'pause';
    if (focusBehavior === 'throttle' || pressureBehavior === 'throttle') {
      return 'throttle';
    }
    if (focusBehavior === 'ignore' || pressureBehavior === 'ignore') {
      return 'ignore';
    }
    return undefined;
  }

  function getEffectiveFps(
    behavior: DegradedBehavior | undefined,
  ): number | undefined {
    if (behavior !== 'throttle') return baseFps;
    return baseFps === undefined ? throttleFps : Math.min(baseFps, throttleFps);
  }

  function createQuality(behavior: DegradedBehavior | undefined): LoopQuality {
    const slowFrameState: SlowFrameState | undefined =
      pressureState === 'full' ? undefined : pressureState;
    if (!focusDegraded && slowFrameState === undefined) return FULL_QUALITY;

    const signals: ActiveQualitySignals = Object.freeze({
      unfocused: focusDegraded,
      slowFrames: slowFrameState,
    }) as ActiveQualitySignals;
    const action: QualityAction =
      behavior === 'throttle'
        ? Object.freeze({
            behavior,
            fps: getEffectiveFps(behavior) as number,
          })
        : Object.freeze({ behavior: behavior as 'pause' | 'ignore' });

    return Object.freeze({ status: 'degraded', signals, action });
  }

  function qualityChanged(next: LoopQuality): boolean {
    return (
      _quality.status !== next.status ||
      _quality.signals.unfocused !== next.signals.unfocused ||
      _quality.signals.slowFrames !== next.signals.slowFrames ||
      _quality.action?.behavior !== next.action?.behavior ||
      (_quality.action?.behavior === 'throttle' &&
        next.action?.behavior === 'throttle' &&
        _quality.action.fps !== next.action.fps)
    );
  }

  function applyEffectiveFps(behavior: DegradedBehavior | undefined): void {
    const fps: number | undefined = getEffectiveFps(behavior);
    if (hasAppliedFps && fps === appliedFps) return;
    hasAppliedFps = true;
    appliedFps = fps;
    ticker?.setFps(fps);
  }

  function pauseReason(): LoopReason | null {
    if (lifecycle?.phase === 'paused') {
      return lifecycle.phaseReason as LoopReason;
    }
    if (_quality.action?.behavior !== 'pause') return null;
    if (focusDegraded && unfocused === 'pause') return 'unfocused';
    return 'slow-frames';
  }

  function reconcile(): void {
    if (_phase === 'stopped' || !intentStarted || lifecycle === null) return;

    const reason: LoopReason | null = pauseReason();
    if (reason !== null) {
      if (ticker !== null && _phase === 'running') ticker.pause();
      setPhase('paused', reason);
      return;
    }

    if (ticker === null) {
      ticker = createTicker({ fps: appliedFps, onTick });
      ticker.start();
      setPhase('running', _reason === 'initial' ? 'started' : 'resumed');
      return;
    }

    if (_phase === 'paused') {
      ticker.resume();
      setPhase('running', 'resumed');
    }
  }

  function reconcileQuality(): void {
    if (_phase === 'stopped') return;

    const behavior: DegradedBehavior | undefined = getResolvedBehavior();
    const nextQuality: LoopQuality = createQuality(behavior);
    const changed: boolean = qualityChanged(nextQuality);
    if (changed) _quality = nextQuality;

    // Internal execution is coherent before either external callback runs.
    applyEffectiveFps(behavior);
    reconcile();
    if (changed && !isStopped()) onQualityChange?.(nextQuality);
  }

  function isStopped(): boolean {
    return _phase === 'stopped';
  }

  function onFocusChange(focused: boolean): void {
    focusDegraded = !focused;
    if (intentStarted) reconcileQuality();
  }

  function onPressureChange(next: FramePressureState): void {
    pressureState = next;
    if (intentStarted) reconcileQuality();
  }

  function start(): void {
    if (_phase === 'stopped' || intentStarted) return;
    intentStarted = true;
    reconcileQuality();
    lifecycle?.start();
    reconcile();
  }

  function dispose(notify: boolean): void {
    if (_phase === 'stopped') return;

    _phase = 'stopped';
    _reason = 'disposed';
    intentStarted = false;
    unlinkAbort?.();
    unlinkAbort = undefined;
    ticker?.stop();
    ticker = null;
    lifecycle?.stop();
    unsubFocus?.();
    unsubFocus = null;
    unsubPressure?.();
    unsubPressure = null;

    if (notify) onPhaseChange?.('stopped', 'disposed');
  }

  function stop(): void {
    dispose(true);
  }

  try {
    lifecycle = createLifecycle({
      element,
      reducedMotion,
      intersectionOptions,
      start: 'manual',
      onPhaseChange: reconcile,
    });
    unsubFocus = subscribeFocus(onFocusChange);
    unsubPressure = subscribeFramePressure(onPressureChange);
    pressureState = readFramePressure();
    unlinkAbort = linkAbortSignal(signal, stop);

    if (startMode === 'auto') start();
  } catch (error) {
    dispose(false);
    throw error;
  }

  return {
    start,
    stop,
    get phase() {
      return _phase;
    },
    get phaseReason() {
      return _reason;
    },
    get quality() {
      return _quality;
    },
  };
}
