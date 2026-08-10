import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { createLifecycle } from '../lifecycle';
import { createTicker } from '../tick';
import type { FrameState, Ticker } from '../tick';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReducedMotionBehavior = 'pause' | 'complete' | 'ignore';
export type DegradedBehavior = 'throttle' | 'pause' | 'ignore';

export type LoopPhase = 'idle' | 'running' | 'paused' | 'stopped';
export type LoopReason =
  | 'initial'
  | 'started'
  | 'resumed'
  | 'sight'
  | 'reduced-motion'
  | 'degraded'
  | 'manual'
  | 'disposed';

export type Quality = 'full' | 'degraded';
export type DegradedReason = 'unfocused' | 'frame-budget';

interface LoopOptionsBase {
  element: Element;
  /**
   * Called every frame. Write to refs or DOM directly. Never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: (frame: FrameState) => void;
  fps?: number;
  reducedMotion?: ReducedMotionBehavior;
  intersectionOptions?: IntersectionObserverInit;
  start?: 'auto' | 'manual';
  onPhaseChange?: (phase: LoopPhase, reason: LoopReason) => void;
  /** Abort signal that stops the loop when aborted. */
  signal?: AbortSignal;
}

type DegradedOptions =
  | { degraded?: 'throttle'; degradedFps?: number }
  | { degraded: 'pause' }
  | { degraded: 'ignore' };

export type LoopOptions = LoopOptionsBase & DegradedOptions;

export interface Loop {
  start(): void;
  stop(): void;
  readonly phase: LoopPhase;
  readonly phaseReason: LoopReason;
  readonly quality: Quality;
  readonly qualityReason: DegradedReason | undefined;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many consecutive over-budget frames before degrading quality. */
const OVER_BUDGET_THRESHOLD = 3;

/** FPS cap applied when quality is degraded (throttle mode). */
const DEGRADED_FPS_CAP = 30;

/**
 * In `degraded: 'pause'` mode a frame-budget degrade pauses the loop, so no
 * further frames tick to clear it. Without a timer the loop would stay paused
 * forever after a transient spike. After this delay the loop optimistically
 * un-pauses and re-measures, rescheduling on each subsequent degrade. (Throttle
 * mode keeps ticking, so it does not use this.)
 */
const RECOVERY_RETRY_MS = 2000;

// ---------------------------------------------------------------------------
// createLoop
// ---------------------------------------------------------------------------

/**
 * Lifecycle-aware animation loop composing ticker, visibility, and reduced motion.
 *
 * Pass an element and get a loop that pauses when the element leaves the viewport
 * or the tab is backgrounded, resumes when it returns, and cleans up with `stop()`.
 *
 * @remarks
 * The loop is signal-driven and exposes only `start()` and `stop()`. There is no
 * imperative `pause()`/`resume()`. Pausing is decided by visibility, reduced
 * motion, and quality, so an imperative pause would compete with those signals.
 * For manual control, use `useLoop`'s `enabled` option (React) or `createLifecycle`,
 * which exposes `pause()`/`resume()` for loops you drive yourself.
 *
 * @example
 * const loop = createLoop({
 *   element: el,
 *   onTick: (frame) => draw(ctx, frame),
 * });
 * // cleanup:
 * loop.stop();
 */
export function createLoop(options: LoopOptions): Loop {
  if (typeof requestAnimationFrame === 'undefined') {
    serverContextError('createLoop');
  }

  const {
    element,
    onTick,
    fps: baseFps,
    reducedMotion = 'pause',
    degraded = 'throttle' as DegradedBehavior,
    degradedFps: configuredDegradedFps,
    intersectionOptions,
    start: startMode = 'auto',
    onPhaseChange,
    signal,
  } = options as LoopOptionsBase & {
    degraded?: DegradedBehavior;
    degradedFps?: number;
    signal?: AbortSignal;
  };

  if (!element) noElementError('createLoop');

  const degradedFps: number | undefined =
    degraded === 'throttle' ? configuredDegradedFps : undefined;

  // --- State ---

  let _phase: LoopPhase = 'idle';
  let _reason: LoopReason = 'initial';
  let _quality: Quality = 'full';
  let _qualityReason: DegradedReason | undefined;

  let intentStarted = false;
  let overBudgetCount = 0;
  let ticker: Ticker | null = null;

  // The adaptive-quality ticker can be replaced while the loop is running.
  // Keep the consumer-facing frame owned by the loop so its timeline and
  // object identity remain continuous across those internal replacements.
  const frame: FrameState = { time: 0, delta: 0, elapsed: 0, frame: 0 };

  // Quality signal flags
  let focusDegraded = false;

  // Pending pause-mode frame-budget recovery timer (see RECOVERY_RETRY_MS).
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  // --- State transitions ---

  function setPhase(phase: LoopPhase, reason: LoopReason): void {
    if (_phase === phase && _reason === reason) return;
    _phase = phase;
    _reason = reason;
    onPhaseChange?.(phase, reason);
  }

  function setQuality(quality: Quality, reason?: DegradedReason): void {
    const changed = _quality !== quality;
    _quality = quality;
    _qualityReason = reason;

    if (!changed) return;

    if (degraded === 'throttle') {
      if (ticker && _phase === 'running') {
        queueMicrotask(rebuildTicker);
      }
    } else if (degraded === 'pause') {
      reconcile();
    }
  }

  /** Evaluate all quality signals and pick the highest-priority active one. */
  function reconcileQuality(): void {
    if (focusDegraded) {
      setQuality('degraded', 'unfocused');
      return;
    }
    if (overBudgetCount >= OVER_BUDGET_THRESHOLD) {
      setQuality('degraded', 'frame-budget');
      return;
    }
    setQuality('full');
  }

  /**
   * Un-pause and re-measure after a pause-mode frame-budget degrade. If frames
   * are still over budget, the next degrade reschedules this.
   */
  function scheduleBudgetRecovery(): void {
    if (recoveryTimer !== null) return;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      overBudgetCount = 0;
      reconcileQuality();
    }, RECOVERY_RETRY_MS);
  }

  function clearBudgetRecovery(): void {
    if (recoveryTimer === null) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  // --- Ticker lifecycle ---

  function getEffectiveFps(): number | undefined {
    if (_quality !== 'degraded') return baseFps;
    const cap: number = degradedFps ?? DEGRADED_FPS_CAP;
    if (baseFps === undefined) return cap;
    return Math.min(baseFps, cap);
  }

  function destroyTicker(): void {
    if (!ticker) return;
    ticker.stop();
    ticker = null;
  }

  function buildTicker(): void {
    const targetFps: number | undefined = getEffectiveFps();
    const budget: number = 1000 / (targetFps ?? 60);
    const elapsedOffset: number = frame.elapsed;

    destroyTicker();

    ticker = createTicker({
      fps: targetFps,
      onTick: (tickerFrame) => {
        frame.time = tickerFrame.time;
        frame.delta = tickerFrame.delta;
        frame.elapsed = elapsedOffset + tickerFrame.elapsed;
        frame.frame++;
        checkFrameBudget(frame.delta, budget);
        onTick(frame);
      },
    });
    ticker.start();
  }

  function rebuildTicker(): void {
    if (_phase !== 'running' || !ticker) return;
    buildTicker();
  }

  function checkFrameBudget(delta: number, budget: number): void {
    if (delta <= budget * 1.5) {
      overBudgetCount = 0;
      return;
    }

    overBudgetCount++;
    if (overBudgetCount < OVER_BUDGET_THRESHOLD) return;

    reconcileQuality();
    // Pause mode stops ticking once degraded, so no future frame can clear the
    // degraded state — schedule a timed retry. Throttle keeps running.
    if (degraded === 'pause') scheduleBudgetRecovery();
  }

  // --- Reconcile ---

  /** Check if any signal requires the loop to be paused. */
  function shouldPause(): LoopReason | null {
    // Visibility + reduced motion are owned by the lifecycle; its paused reasons
    // ('sight' | 'reduced-motion') are a subset of LoopReason.
    if (lifecycle.phase === 'paused')
      return lifecycle.phaseReason as LoopReason;
    // Quality-driven pause stays here — it needs the ticker's frame timing.
    if (degraded === 'pause' && _quality === 'degraded') return 'degraded';
    return null;
  }

  /** Evaluate all signals and transition to the correct phase. */
  function reconcile(): void {
    if (_phase === 'stopped' || !intentStarted) return;

    const pauseReason = shouldPause();

    if (pauseReason) {
      if (ticker && _phase === 'running') ticker.pause();
      setPhase('paused', pauseReason);
      return;
    }

    if (!ticker) {
      buildTicker();
      setPhase('running', _reason === 'initial' ? 'started' : 'resumed');
    } else if (_phase === 'paused') {
      ticker.resume();
      setPhase('running', 'resumed');
    }
  }

  // --- Signal handlers ---

  function onFocusChange(): void {
    focusDegraded = !document.hasFocus();
    reconcileQuality();
  }

  // --- Init subsystems ---

  // Lifecycle owns the visibility + reduced-motion decision. The loop layers the
  // ticker and quality (frame-budget / focus) on top. Driven manually so it only
  // activates once the loop itself starts.
  const lifecycle = createLifecycle({
    element,
    reducedMotion: reducedMotion === 'pause' ? 'pause' : 'ignore',
    intersectionOptions,
    start: 'manual',
    onPhaseChange: reconcile,
  });

  const unsubFocus: () => void = subscribeFocusTracking(onFocusChange);

  // --- Public API ---

  function start(): void {
    if (_phase === 'stopped') return;
    intentStarted = true;
    lifecycle.start();
    reconcile();
  }

  function stop(): void {
    if (_phase === 'stopped') return;
    unlinkAbort?.();
    clearBudgetRecovery();
    destroyTicker();
    lifecycle.stop();
    unsubFocus();
    setPhase('stopped', 'disposed');
  }

  // Declared before assignment because an already-aborted signal makes
  // linkAbortSignal call stop() synchronously, which reads unlinkAbort.
  let unlinkAbort: (() => void) | undefined;
  unlinkAbort = linkAbortSignal(signal, stop);

  if (startMode === 'auto') {
    start();
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
    get qualityReason() {
      return _qualityReason;
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function subscribeFocusTracking(onChange: () => void): () => void {
  window.addEventListener('focus', onChange);
  window.addEventListener('blur', onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    window.removeEventListener('blur', onChange);
  };
}
