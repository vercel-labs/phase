import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { createLifecycle } from '../lifecycle';
import { createTicker } from '../tick';
import type { FrameState, Ticker } from '../tick';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Behavior under reduced motion. `'pause'` stops the loop entirely;
 * `'ignore'` keeps running. Loops have no defined end state, so there is no
 * `'complete'`; jump-to-target lives on `useTween`.
 */
export type LoopReducedMotion = 'pause' | 'ignore';

/**
 * Per-signal behavior when a quality signal is active.
 *
 * `'pause'` strongly pauses scheduling, `'throttle'` caps the ticker at
 * `throttleFps`, and `'ignore'` reports quality without changing execution.
 * When signals overlap, pause takes precedence over throttle, which takes
 * precedence over ignore.
 */
export type DegradedBehavior = 'throttle' | 'pause' | 'ignore';

export type LoopPhase = 'idle' | 'running' | 'paused' | 'stopped';
export type LoopReason =
  | 'initial'
  | 'started'
  | 'resumed'
  | 'sight'
  | 'reduced-motion'
  | 'degraded'
  | 'disposed';

/** Whether any quality signal is active, independent of its configured behavior. */
export type Quality = 'full' | 'degraded';
/** Active quality signal. Unfocused takes reporting priority when both are active. */
export type DegradedReason = 'unfocused' | 'frame-budget';

/** Called when quality, reporting-priority reason, or resolved behavior changes. */
export type QualityChangeCallback = (
  quality: Quality,
  reason: DegradedReason | undefined,
  behavior: DegradedBehavior | undefined,
) => void;

export interface LoopOptions {
  element: Element;
  /**
   * Called every frame. Write to refs or DOM directly. Never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: (frame: FrameState) => void;
  /**
   * Base FPS cap. Default: uncapped (display refresh rate). Values that are
   * not positive and finite are treated as uncapped.
   */
  fps?: number;
  /** Behavior when the user prefers reduced motion. Default `'pause'`. */
  reducedMotion?: LoopReducedMotion;
  /**
   * Behavior while `document.hasFocus()` is false. Default `'pause'`.
   * Document/viewport visibility is separate and always strongly pauses.
   */
  unfocused?: DegradedBehavior;
  /**
   * Behavior after three consecutive delivered frames arrive more than 1.5x
   * the current target interval apart (25ms at 60fps). Default `'throttle'`.
   */
  frameBudget?: DegradedBehavior;
  /**
   * Shared FPS cap while any active signal resolves to `'throttle'`.
   * Never raises a lower `fps` cap. Default `30`.
   */
  throttleFps?: number;
  /** Options forwarded to the pooled visibility observer. */
  intersectionOptions?: IntersectionObserverInit;
  /** Whether to start honoring signals immediately. Default `'auto'`. */
  start?: 'auto' | 'manual';
  /**
   * Called on every loop phase or phase-reason transition. With the default
   * `start: 'auto'` the first transition fires synchronously during
   * `createLoop`, before it returns, so do not reference the loop instance
   * from this callback without guarding for it.
   */
  onPhaseChange?: (phase: LoopPhase, reason: LoopReason) => void;
  /**
   * Called when quality, reporting-priority reason, or resolved behavior
   * changes. Fires synchronously during `createLoop` when the window is
   * already unfocused (see `onPhaseChange` for the instance caveat).
   */
  onQualityChange?: QualityChangeCallback;
  /** Abort signal that stops the loop when aborted. */
  signal?: AbortSignal;
}

export interface Loop {
  start(): void;
  stop(): void;
  readonly phase: LoopPhase;
  readonly phaseReason: LoopReason;
  /** Current quality signal state, independent of pause/throttle/ignore behavior. */
  readonly quality: Quality;
  /** Active signal; `'unfocused'` has reporting priority when both are active. */
  readonly qualityReason: DegradedReason | undefined;
  /** Resolved behavior after applying pause > throttle > ignore precedence. */
  readonly qualityBehavior: DegradedBehavior | undefined;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many consecutive over-budget frames before degrading quality. */
const OVER_BUDGET_THRESHOLD = 3;

/** Default FPS cap while a quality signal resolves to `'throttle'`. */
const DEFAULT_THROTTLE_FPS = 30;

/**
 * A frame-budget degrade cannot clear itself: pause stops measuring entirely,
 * and throttle widens the delivered gaps to match the cap. After this delay
 * the loop optimistically restores full speed and re-measures; sustained jank
 * re-trips the threshold within a few frames and reschedules.
 */
const RECOVERY_RETRY_MS = 2000;

// ---------------------------------------------------------------------------
// createLoop
// ---------------------------------------------------------------------------

/**
 * Lifecycle-aware animation loop composing ticker, visibility, and reduced motion.
 *
 * Pass an element and get a loop that pauses when the element leaves the
 * viewport or the tab is backgrounded (always), applies configurable behavior
 * when the window loses focus (`unfocused`, default pause: blur freezes the
 * timeline, refocus resumes in place) or frames exceed budget (`frameBudget`,
 * default throttle), and cleans up with `stop()`.
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
    unfocused = 'pause',
    frameBudget = 'throttle',
    throttleFps = DEFAULT_THROTTLE_FPS,
    intersectionOptions,
    start: startMode = 'auto',
    onPhaseChange,
    onQualityChange,
    signal,
  } = options;

  if (!element) noElementError('createLoop');

  // --- State ---

  let _phase: LoopPhase = 'idle';
  let _reason: LoopReason = 'initial';
  let _quality: Quality = 'full';
  let _qualityReason: DegradedReason | undefined;
  let _qualityBehavior: DegradedBehavior | undefined;

  let intentStarted = false;

  // One persistent ticker owns the timeline (FrameState, elapsed, delta
  // clamping, pause exclusion). Quality changes mutate its FPS gate in place
  // via setFps, so the consumer timeline never resets or skews.
  let ticker: Ticker | null = null;

  // --- Quality signals ---
  //
  // Each signal is explicit state resolved through its configured behavior.
  // Quality, reporting-priority reason, and resolved behavior stay observable
  // (even for 'ignore') so consumers can adapt.

  let focusDegraded = false;
  let budgetDegraded = false;
  let overBudgetCount = 0;

  // Frame-budget measurement: raw gap between delivered frames against 1.5x
  // the current target interval. 0 = no previous frame (start, resume, or an
  // fps change), so pause gaps and cross-cadence gaps never count as jank.
  let lastBudgetTime = 0;
  let budgetThreshold = 0;

  // The fps currently applied to the ticker, tracked so an unchanged value
  // skips the (measurement-resetting) re-apply. `undefined` is a real value
  // here (uncapped), so a separate flag marks "never applied".
  let appliedFps: number | undefined;
  let hasAppliedFps = false;

  // Pending optimistic frame-budget recovery timer (see RECOVERY_RETRY_MS).
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  // --- State transitions ---

  function setPhase(phase: LoopPhase, reason: LoopReason): void {
    if (_phase === phase && _reason === reason) return;
    _phase = phase;
    _reason = reason;
    onPhaseChange?.(phase, reason);
  }

  function setQuality(
    quality: Quality,
    reason: DegradedReason | undefined,
    behavior: DegradedBehavior | undefined,
  ): void {
    if (
      _quality === quality &&
      _qualityReason === reason &&
      _qualityBehavior === behavior
    ) {
      return;
    }
    _quality = quality;
    _qualityReason = reason;
    _qualityBehavior = behavior;
    onQualityChange?.(quality, reason, behavior);
  }

  function getQualityBehavior(): DegradedBehavior | undefined {
    const focusBehavior: DegradedBehavior | undefined = focusDegraded
      ? unfocused
      : undefined;
    const budgetBehavior: DegradedBehavior | undefined = budgetDegraded
      ? frameBudget
      : undefined;
    if (focusBehavior === 'pause' || budgetBehavior === 'pause') return 'pause';
    if (focusBehavior === 'throttle' || budgetBehavior === 'throttle') {
      return 'throttle';
    }
    if (focusBehavior === 'ignore' || budgetBehavior === 'ignore')
      return 'ignore';
    return undefined;
  }

  /**
   * Re-evaluate quality signals, then reconcile phase and ticker fps. Pause
   * wins over throttle wins over ignore when multiple signals are active.
   */
  function reconcileQuality(): void {
    if (_phase === 'stopped') return;

    if (focusDegraded) {
      setQuality('degraded', 'unfocused', getQualityBehavior());
    } else if (budgetDegraded) {
      setQuality('degraded', 'frame-budget', getQualityBehavior());
    } else {
      setQuality('full', undefined, undefined);
    }

    reconcile();
    applyEffectiveFps();
  }

  /**
   * Optimistically clear a frame-budget degrade and re-measure at full speed.
   * If frames are still over budget, the next degrade reschedules this.
   */
  function scheduleBudgetRecovery(): void {
    if (recoveryTimer !== null || _phase === 'stopped') return;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      budgetDegraded = false;
      overBudgetCount = 0;
      reconcileQuality();
    }, RECOVERY_RETRY_MS);
  }

  function clearBudgetRecovery(): void {
    if (recoveryTimer === null) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  // --- Ticker control ---

  function getEffectiveFps(): number | undefined {
    if (_qualityBehavior !== 'throttle') return baseFps;
    if (baseFps === undefined) return throttleFps;
    return Math.min(baseFps, throttleFps);
  }

  /**
   * Sync the ticker's FPS gate and the budget threshold to the resolved fps.
   * A non-positive or non-finite `fps` leaves the ticker uncapped, so the
   * threshold falls back to the 60fps budget rather than becoming Infinity,
   * negative, or NaN (which would disable or constantly trip detection).
   */
  function applyEffectiveFps(): void {
    const fps: number | undefined = getEffectiveFps();
    if (hasAppliedFps && fps === appliedFps) return;
    hasAppliedFps = true;
    appliedFps = fps;

    budgetThreshold = 1500 / (fps !== undefined && fps > 0 ? fps : 60);
    // A gap produced under the previous cadence must not be measured against
    // the new threshold; start measuring fresh from the next delivered frame.
    lastBudgetTime = 0;
    overBudgetCount = 0;
    ticker?.setFps(fps);
  }

  function checkFrameBudget(now: number): void {
    const last: number = lastBudgetTime;
    lastBudgetTime = now;
    if (last === 0) return; // first delivered frame since start/resume

    if (now - last <= budgetThreshold) {
      overBudgetCount = 0;
      return;
    }

    overBudgetCount++;
    if (budgetDegraded || overBudgetCount < OVER_BUDGET_THRESHOLD) return;

    budgetDegraded = true;
    reconcileQuality();
    scheduleBudgetRecovery();
  }

  // The one frame callback, created once for the life of the loop. Forwards
  // the ticker-owned frame after measuring the budget from raw frame gaps
  // (the clamped delta would hide jank at low fps caps).
  function loopTick(frame: FrameState): void {
    checkFrameBudget(frame.time);
    // A budget degrade may have paused or stopped the loop synchronously.
    if (_phase !== 'running') return;
    onTick(frame);
  }

  // --- Reconcile ---

  /** Check if any signal requires the loop to be paused. */
  function shouldPause(): LoopReason | null {
    // Visibility + reduced motion are owned by the lifecycle; its paused reasons
    // ('sight' | 'reduced-motion') are a subset of LoopReason.
    if (lifecycle.phase === 'paused')
      return lifecycle.phaseReason as LoopReason;
    // Quality-driven pause stays here — it needs the ticker's frame timing.
    if (_qualityBehavior === 'pause') return 'degraded';
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
      // First activation: stop() is terminal, so this runs once per loop.
      applyEffectiveFps(); // resolves appliedFps + budget threshold
      ticker = createTicker({ fps: appliedFps, onTick: loopTick });
      ticker.start();
      setPhase('running', _reason === 'initial' ? 'started' : 'resumed');
    } else if (_phase === 'paused') {
      // The ticker excludes paused time and resets its own delta; the budget
      // measurement starts fresh so neither the pause gap nor a stale
      // consecutive count carries across the pause.
      lastBudgetTime = 0;
      overBudgetCount = 0;
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

  // Lifecycle owns the visibility + reduced-motion decision. The loop layers
  // the ticker and quality (frame-budget / focus) on top. Driven manually so
  // it only activates once the loop itself starts.
  const lifecycle = createLifecycle({
    element,
    reducedMotion,
    intersectionOptions,
    start: 'manual',
    onPhaseChange: reconcile,
  });

  const unsubFocus: () => void = subscribeFocusTracking(onFocusChange);
  focusDegraded = !document.hasFocus();
  if (focusDegraded) reconcileQuality();

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
    // Transition first: teardown below fires callbacks (lifecycle onPhaseChange
    // re-enters reconcile), and the stopped guard must already hold.
    setPhase('stopped', 'disposed');
    ticker?.stop();
    ticker = null;
    lifecycle.stop();
    unsubFocus();
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
    get qualityBehavior() {
      return _qualityBehavior;
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
