import { diagnostics } from '../_internal/errors';
import {
  readMediaQuery,
  subscribeMediaQuery,
} from '../_internal/pool/mql-pool';
import { createSight } from '../sight';
import type { SightPhase } from '../sight';
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
  | 'enabled'
  | 'context-lost'
  | 'manual'
  | 'disposed';

export type Quality = 'full' | 'degraded';
export type DegradedReason = 'unfocused' | 'frame-budget';

interface LoopOptionsBase {
  element: Element;
  /**
   * Called every frame. Write to refs or DOM directly — never call React
   * `setState` here (60 calls/sec = 60 re-renders/sec).
   */
  onTick: (frame: FrameState) => void;
  fps?: number;
  reducedMotion?: ReducedMotionBehavior;
  intersectionOptions?: IntersectionObserverInit;
  start?: 'auto' | 'manual';
  onPhaseChange?: (phase: LoopPhase, reason: LoopReason) => void;
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

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** How many consecutive over-budget frames before degrading quality. */
const OVER_BUDGET_THRESHOLD = 3;

/** FPS cap applied when quality is degraded (throttle mode). */
const DEGRADED_FPS_CAP = 30;

// ---------------------------------------------------------------------------
// prefersReducedMotion
// ---------------------------------------------------------------------------

/** Synchronous check for prefers-reduced-motion. Client-only; returns false on the server. */
export function prefersReducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return readMediaQuery(REDUCED_MOTION_QUERY);
}

// ---------------------------------------------------------------------------
// createLoop
// ---------------------------------------------------------------------------

/**
 * Batteries-included animation loop composing ticker + sight + reduced motion.
 *
 * Pass an element, get a loop that automatically pauses when the element leaves the
 * viewport or the tab is backgrounded, resumes when it comes back, and cleans up
 * with a single `stop()`.
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
    throw diagnostics.R01_server_context({ fn: 'createLoop' });
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
  } = options as LoopOptionsBase & {
    degraded?: DegradedBehavior;
    degradedFps?: number;
  };

  const degradedFps: number | undefined =
    degraded === 'throttle' ? configuredDegradedFps : undefined;

  // --- State ---

  let _phase: LoopPhase = 'idle';
  let _reason: LoopReason = 'initial';
  let _quality: Quality = 'full';
  let _qualityReason: DegradedReason | undefined;

  let sightVisible = false;
  let reducedMotionActive = false;
  let intentStarted = false;
  let overBudgetCount = 0;
  let ticker: Ticker | null = null;

  // Quality signal flags
  let focusDegraded = false;

  // Set by setQuality when the ticker needs rebuilding with a new FPS cap.
  // Checked after onTick returns to avoid re-entrant ticker destruction.
  let pendingTickerRebuild = false;

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
      // Schedule a ticker rebuild so the new FPS cap takes effect.
      if (ticker && _phase === 'running') {
        pendingTickerRebuild = true;
      }
    } else if (degraded === 'pause') {
      reconcile();
    }
    // 'ignore': state updates only, no auto-action
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

  function getEffectiveFps(): number | undefined {
    if (_quality !== 'degraded') return baseFps;
    const cap: number = degradedFps ?? DEGRADED_FPS_CAP;
    if (baseFps === undefined) return cap;
    return Math.min(baseFps, cap);
  }

  // --- Ticker lifecycle ---

  function destroyTicker(): void {
    if (!ticker) return;
    ticker.stop();
    ticker = null;
  }

  function buildTicker(): void {
    const targetFps: number | undefined = getEffectiveFps();
    const budget: number = 1000 / (targetFps ?? 60);

    destroyTicker();
    pendingTickerRebuild = false;

    ticker = createTicker({
      fps: targetFps,
      onTick: (frame) => {
        checkFrameBudget(frame.delta, budget);
        onTick(frame);

        // Deferred rebuild: quality changed during this tick, recreate with new FPS.
        if (pendingTickerRebuild) buildTicker();
      },
    });
    ticker.start();
  }

  function checkFrameBudget(delta: number, budget: number): void {
    if (delta <= budget * 1.5) {
      overBudgetCount = 0;
      return;
    }

    overBudgetCount++;
    if (overBudgetCount >= OVER_BUDGET_THRESHOLD) {
      reconcileQuality();
    }
  }

  // --- Reconcile ---

  /** Check if any signal requires the loop to be paused. */
  function shouldPause(): LoopReason | null {
    if (reducedMotionActive && reducedMotion === 'pause')
      return 'reduced-motion';
    if (!sightVisible) return 'sight';
    if (degraded === 'pause' && _quality === 'degraded') return 'degraded';
    return null;
  }

  /** Evaluate all signals and transition to the correct phase. */
  function reconcile(): void {
    if (_phase === 'stopped') return;
    if (!intentStarted) return;

    const pauseReason: LoopReason | null = shouldPause();

    if (pauseReason) {
      if (ticker?.phase === 'running') ticker.pause();
      setPhase('paused', pauseReason);
      return;
    }

    // No reason to pause — ensure we're running.
    if (ticker && ticker.phase === 'paused') {
      ticker.resume();
      setPhase('running', 'resumed');
      return;
    }

    if (!ticker) {
      buildTicker();
      setPhase('running', _reason === 'initial' ? 'started' : 'resumed');
    }
  }

  // --- Signal handlers ---

  function onSightChange(phase: SightPhase): void {
    sightVisible = phase === 'visible';
    reconcile();
  }

  function onReducedMotionChange(matches: boolean): void {
    reducedMotionActive = matches;
    reconcile();
  }

  function onFocusChange(): void {
    focusDegraded = !document.hasFocus();
    reconcileQuality();
  }

  // --- Init subsystems ---

  const sight = createSight({
    element,
    intersectionOptions,
    onPhaseChange: onSightChange,
  });

  let unsubReducedMotion: (() => void) | null = null;
  if (reducedMotion !== 'ignore') {
    reducedMotionActive = readMediaQuery(REDUCED_MOTION_QUERY);
    unsubReducedMotion = subscribeMediaQuery(
      REDUCED_MOTION_QUERY,
      onReducedMotionChange,
    );
  }

  const unsubFocus: () => void = subscribeFocusTracking(onFocusChange);

  // --- Public API ---

  function start(): void {
    if (_phase === 'stopped') return;
    intentStarted = true;
    reconcile();
  }

  function stop(): void {
    if (_phase === 'stopped') return;
    destroyTicker();
    sight.dispose();
    unsubReducedMotion?.();
    unsubReducedMotion = null;
    unsubFocus();
    setPhase('stopped', 'disposed');
  }

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
