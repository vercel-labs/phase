import { linkAbortSignal } from '../_internal/abort';
import { noElementError, serverContextError } from '../_internal/errors';
import { createLifecycle } from '../lifecycle';
import { createTicker, DEFAULT_FIRST_DELTA_MS, MAX_DELTA_MS } from '../tick';
import type { FrameState, Ticker } from '../tick';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Behavior under reduced motion. `'pause'` stops the loop (after painting one
 * static frame once visible); `'ignore'` keeps running. Loops have no defined
 * end state, so there is no `'complete'`; jump-to-target lives on `useTween`.
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
  /** Base FPS cap. Default: uncapped (display refresh rate). */
  fps?: number;
  /** Behavior when the user prefers reduced motion. Default `'pause'`. */
  reducedMotion?: LoopReducedMotion;
  /**
   * Behavior while `document.hasFocus()` is false. Default `'pause'`.
   * Document/viewport visibility is separate and always strongly pauses.
   */
  unfocused?: DegradedBehavior;
  /**
   * Behavior after three consecutive frames exceed 1.5x the current target
   * interval (25ms at 60fps). Default `'throttle'`.
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
  /** Called on every loop phase or phase-reason transition. */
  onPhaseChange?: (phase: LoopPhase, reason: LoopReason) => void;
  /** Called when quality, reporting-priority reason, or resolved behavior changes. */
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
 * With `frameBudget: 'pause'` a frame-budget degrade pauses the loop, so no
 * further frames tick to clear it. Without a timer the loop would stay paused
 * forever after a transient spike. After this delay the loop optimistically
 * un-pauses and re-measures, rescheduling on each subsequent degrade. (Throttle
 * keeps ticking, so it does not use this.)
 */
const RECOVERY_RETRY_MS = 2000;

// ---------------------------------------------------------------------------
// createLoop
// ---------------------------------------------------------------------------

/**
 * Lifecycle-aware animation loop composing ticker, visibility, and reduced motion.
 *
 * Pass an element and get a loop that pauses when the element leaves the viewport,
 * the tab is backgrounded, or the window loses focus, resumes when they return,
 * and cleans up with `stop()`. Each quality signal has its own behavior:
 * `unfocused` pauses by default (blur freezes the timeline, refocus resumes in
 * place), `frameBudget` throttles by default (slow devices degrade gracefully).
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
  let overBudgetCount = 0;
  let ticker: Ticker | null = null;

  // --- Loop-owned timeline ---
  //
  // Adaptive quality destroys and recreates the internal ticker while the loop
  // is running, and a ticker resets its own timeline on every start. So the
  // consumer-facing FrameState and all timing bookkeeping live here, where they
  // survive rebuilds; the ticker is only a scheduler.

  // Pre-allocated and mutated in place each frame: zero allocations per tick.
  const frame: FrameState = { time: 0, delta: 0, elapsed: 0, frame: 0 };

  // Frame budget for the current ticker generation (updated by buildTicker).
  let budget: number = 1000 / 60;

  // Timestamp of the previous tick; 0 means none (fresh start or just resumed)
  // so the next tick uses the default first delta instead of the real gap.
  let lastTickTime = 0;

  // elapsed = now - timelineStart - totalPausedTime, mirroring the ticker's
  // own elapsed semantics but spanning every ticker generation.
  let timelineStart = 0;
  let totalPausedTime = 0;
  let pauseStartTime = 0;

  // --- Quality signals ---
  //
  // Each signal is tracked independently and resolves through its own
  // configured behavior. Quality state, reporting-priority reason, and resolved
  // behavior stay observable (even for 'ignore') so consumers can adapt.

  let focusDegraded = false;
  // Latched at reconcileQuality time: over-budget frames reset the counter on
  // the next good frame, but the degrade holds until a signal re-evaluates it.
  let budgetDegraded = false;

  // The fps the current ticker was built with, to rebuild only on change.
  let appliedFps: number | undefined;

  // Pending frameBudget:'pause' recovery timer (see RECOVERY_RETRY_MS).
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  // Pending one-shot reduced-motion paint (see schedulePaint). 0 = none.
  let paintRafId = 0;

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
    budgetDegraded = overBudgetCount >= OVER_BUDGET_THRESHOLD;

    if (focusDegraded) {
      setQuality('degraded', 'unfocused', getQualityBehavior());
    } else if (budgetDegraded) {
      setQuality('degraded', 'frame-budget', getQualityBehavior());
    } else {
      setQuality('full', undefined, undefined);
    }

    reconcile();
    syncTicker();
  }

  /**
   * Un-pause and re-measure after a frameBudget:'pause' degrade. If frames are
   * still over budget, the next degrade reschedules this.
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
    if (_qualityBehavior !== 'throttle') return baseFps;
    if (baseFps === undefined) return throttleFps;
    return Math.min(baseFps, throttleFps);
  }

  function destroyTicker(): void {
    if (!ticker) return;
    ticker.stop();
    ticker = null;
  }

  // The one frame callback, created once and shared by every ticker
  // generation. Reads only the shared-clock timestamp from the ticker's frame;
  // delta, elapsed, and the frame counter come from the loop's own timeline so
  // rebuilds never reset or skew them.
  function bridgeTick(tickerFrame: FrameState): void {
    const now: number = tickerFrame.time;
    const rawDelta: number =
      lastTickTime === 0 ? DEFAULT_FIRST_DELTA_MS : now - lastTickTime;
    lastTickTime = now;

    frame.time = now;
    frame.delta = rawDelta > MAX_DELTA_MS ? MAX_DELTA_MS : rawDelta;
    frame.elapsed = now - timelineStart - totalPausedTime;
    frame.frame++;

    checkFrameBudget(frame.delta);
    onTick(frame);
  }

  function buildTicker(): void {
    const targetFps: number | undefined = getEffectiveFps();
    budget = 1000 / (targetFps ?? 60);
    appliedFps = targetFps;

    destroyTicker();

    ticker = createTicker({ fps: targetFps, onTick: bridgeTick });
    ticker.start();
  }

  function rebuildTicker(): void {
    if (_phase !== 'running' || !ticker) return;
    // A microtask can be stale after rapid signal flips (blur + refocus in one
    // task); skip when the fps already matches.
    if (getEffectiveFps() === appliedFps) return;
    buildTicker();
  }

  /** Rebuild only when the resolved fps no longer matches the ticker's. */
  function syncTicker(): void {
    if (!ticker || _phase !== 'running') return;
    if (getEffectiveFps() !== appliedFps) queueMicrotask(rebuildTicker);
  }

  function checkFrameBudget(delta: number): void {
    if (delta <= budget * 1.5) {
      overBudgetCount = 0;
      return;
    }

    overBudgetCount++;
    if (overBudgetCount < OVER_BUDGET_THRESHOLD) return;

    reconcileQuality();
    // Pause behavior stops ticking once degraded, so no future frame can clear
    // the degraded state, so schedule a timed retry. Throttle keeps running.
    if (frameBudget === 'pause') scheduleBudgetRecovery();
  }

  // --- One-shot reduced-motion paint ---
  //
  // With reducedMotion 'pause' active from the start the loop never ticks,
  // which leaves canvas surfaces blank. Deliver exactly one frame (elapsed 0)
  // once the element is first visible, then stay paused. lastTickTime stays 0
  // so a later real resume still gets a clean first delta.

  function paintOnce(now: number): void {
    paintRafId = 0;
    if (_phase !== 'paused' || _reason !== 'reduced-motion') return;
    if (frame.frame !== 0 || !lifecycle.visible) return;
    frame.time = now;
    frame.delta = DEFAULT_FIRST_DELTA_MS;
    frame.elapsed = 0;
    frame.frame = 1;
    onTick(frame);
  }

  function schedulePaint(): void {
    if (_phase !== 'paused' || _reason !== 'reduced-motion') return;
    if (frame.frame !== 0 || paintRafId !== 0 || !lifecycle.visible) return;
    paintRafId = requestAnimationFrame(paintOnce);
  }

  function cancelPaint(): void {
    if (paintRafId === 0) return;
    cancelAnimationFrame(paintRafId);
    paintRafId = 0;
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
      if (ticker && _phase === 'running') {
        ticker.pause();
        pauseStartTime = performance.now();
      }
      setPhase('paused', pauseReason);
      schedulePaint();
      return;
    }

    if (!ticker) {
      // First activation: stop() is terminal, so this runs once per loop.
      cancelPaint();
      timelineStart = performance.now();
      buildTicker();
      setPhase('running', _reason === 'initial' ? 'started' : 'resumed');
    } else if (_phase === 'paused') {
      cancelPaint();
      totalPausedTime += performance.now() - pauseStartTime;
      // Reset so the first resumed tick gets a clean delta (not the pause gap).
      lastTickTime = 0;
      ticker.resume();
      setPhase('running', 'resumed');
      // Apply any fps change that happened while paused.
      syncTicker();
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
  // activates once the loop itself starts. onVisibleChange feeds the deferred
  // reduced-motion paint (the composed phase hides sight while RM-paused).
  const lifecycle = createLifecycle({
    element,
    reducedMotion,
    intersectionOptions,
    start: 'manual',
    onPhaseChange: reconcile,
    onVisibleChange: schedulePaint,
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
    cancelPaint();
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
