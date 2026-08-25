import { linkAbortSignal } from '../_internal/abort';
import { noTargetError, serverContextError } from '../_internal/errors';
import {
  readMediaQuery,
  subscribeMediaQuery,
} from '../_internal/pool/mql-pool';
import { createSight } from '../sight';
import type { SightPhase } from '../sight';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LifecyclePhase = 'idle' | 'active' | 'paused' | 'stopped';
export type LifecycleReason =
  | 'initial'
  | 'started'
  | 'resumed'
  | 'sight'
  | 'reduced-motion'
  | 'manual'
  | 'disposed';

/** Whether reduced motion pauses the lifecycle. Default `'pause'`. */
export type LifecycleReducedMotion = 'pause' | 'ignore';

export interface LifecycleOptions {
  /** Element to observe, or `document` to anchor to the page. */
  target: Element | Document;
  reducedMotion?: LifecycleReducedMotion;
  intersectionOptions?: IntersectionObserverInit;
  start?: 'auto' | 'manual';
  onPhaseChange?: (phase: LifecyclePhase, reason: LifecycleReason) => void;
  /** Abort signal that stops the lifecycle when aborted. */
  signal?: AbortSignal;
}

export interface Lifecycle {
  /** Begin honoring signals. Called automatically unless `start: 'manual'`. */
  start(): void;
  /** Terminal. Disposes observers and listeners. Cannot be restarted. */
  stop(): void;
  /** Manually pause (e.g. a panel opened over the animation). Lowest priority. */
  pause(): void;
  /** Clear a manual pause. */
  resume(): void;
  readonly phase: LifecyclePhase;
  readonly phaseReason: LifecycleReason;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// ---------------------------------------------------------------------------
// createLifecycle
// ---------------------------------------------------------------------------

/**
 * The activation decision for an animation, decoupled from who drives the frames.
 *
 * Composes visibility (`createSight`), reduced motion, and a manual pause into a
 * single `active` / `paused` phase. Use when you own your render loop (WebGL,
 * three.js, a Web Worker, or non-rAF work that should still pause off-screen or
 * under reduced motion). For loops `phase` should drive, use `createLoop` instead.
 *
 * @example
 * const lifecycle = createLifecycle({
 *   target: canvas,
 *   onPhaseChange: (phase) => {
 *     if (phase === 'active') renderer.start();
 *     else renderer.stop();
 *   },
 * });
 * // cleanup:
 * lifecycle.stop();
 */
export function createLifecycle(options: LifecycleOptions): Lifecycle {
  if (typeof document === 'undefined') {
    serverContextError('createLifecycle');
  }

  const {
    target,
    reducedMotion = 'pause',
    intersectionOptions,
    start: startMode = 'auto',
    onPhaseChange,
    signal,
  } = options;

  if (!target) noTargetError('createLifecycle');

  let _phase: LifecyclePhase = 'idle';
  let _reason: LifecycleReason = 'initial';

  let sightVisible = false;
  let reducedMotionActive = false;
  let manualPaused = false;
  let intentStarted = false;
  let hasBeenActive = false;

  function setPhase(phase: LifecyclePhase, reason: LifecycleReason): void {
    if (_phase === phase && _reason === reason) return;
    _phase = phase;
    _reason = reason;
    onPhaseChange?.(phase, reason);
  }

  /** Highest-priority active pause signal, or null when nothing should pause. */
  function pauseReason(): LifecycleReason | null {
    if (reducedMotionActive && reducedMotion === 'pause')
      return 'reduced-motion';
    if (!sightVisible) return 'sight';
    if (manualPaused) return 'manual';
    return null;
  }

  function reconcile(): void {
    if (_phase === 'stopped' || !intentStarted) return;

    const reason = pauseReason();
    if (reason) {
      setPhase('paused', reason);
      return;
    }

    setPhase('active', hasBeenActive ? 'resumed' : 'started');
    hasBeenActive = true;
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

  // --- Init subsystems ---

  const sight = createSight({
    target,
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

  // --- Public API ---

  function start(): void {
    if (_phase === 'stopped') return;
    intentStarted = true;
    reconcile();
  }

  function stop(): void {
    if (_phase === 'stopped') return;
    unlinkAbort?.();
    sight.stop();
    unsubReducedMotion?.();
    unsubReducedMotion = null;
    setPhase('stopped', 'disposed');
  }

  function pause(): void {
    if (manualPaused) return;
    manualPaused = true;
    reconcile();
  }

  function resume(): void {
    if (!manualPaused) return;
    manualPaused = false;
    reconcile();
  }

  let unlinkAbort: (() => void) | undefined;
  unlinkAbort = linkAbortSignal(signal, stop);

  if (startMode === 'auto') {
    start();
  }

  return {
    start,
    stop,
    pause,
    resume,
    get phase() {
      return _phase;
    },
    get phaseReason() {
      return _reason;
    },
  };
}
