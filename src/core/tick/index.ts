import { linkAbortSignal } from '../_internal/abort';
import {
  invalidFpsError,
  serverContextError,
  tickerStoppedError,
} from '../_internal/errors';
import {
  createFrameSubscription,
  joinSharedFrame,
  leaveSharedFrame,
} from '../_internal/frame-clock';
import type { FrameSubscription } from '../_internal/frame-clock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameState {
  /** Current timestamp from performance.now(). */
  readonly time: number;
  /** Milliseconds since last tick, clamped to 40ms. */
  readonly delta: number;
  /** Milliseconds since start, excluding paused time. */
  readonly elapsed: number;
  /** Frame count since start. */
  readonly frame: number;
}

type MutableFrameState = {
  -readonly [Key in keyof FrameState]: FrameState[Key];
};

export type TickerPhase = 'idle' | 'running' | 'paused' | 'stopped';
export type TickerReason =
  | 'initial'
  | 'started'
  | 'resumed'
  | 'manual'
  | 'disposed';

export interface TickerOptions {
  /** Cap frame rate. Default: uncapped (display refresh rate). */
  fps?: number;
  /**
   * Called every frame with the current frame state. Write to refs or DOM
   * directly. Never call React `setState` here (60 state updates/sec = 60 re-renders/sec).
   */
  onTick: (frame: FrameState) => void;
  /** Abort signal that stops the ticker when aborted. */
  signal?: AbortSignal;
}

export interface Ticker {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /**
   * Change the FPS cap in place. The timeline (elapsed, delta history, frame
   * count, `FrameState` identity) is untouched; only the scheduling gate
   * changes. `undefined` removes the cap, mirroring the `fps` option.
   */
  setFps(fps?: number): void;
  readonly phase: TickerPhase;
  readonly phaseReason: TickerReason;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prevents teleportation on resume. Matches motion's maxElapsed. */
const MAX_DELTA_MS = 40;

/** Default first-frame delta when no previous tick exists. */
const DEFAULT_FIRST_DELTA_MS = 16.67;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetFrameState(state: MutableFrameState): void {
  state.time = 0;
  state.delta = 0;
  state.elapsed = 0;
  state.frame = 0;
}

function getMinFrameTime(fn: string, fps: number | undefined): number {
  if (fps === undefined) return 0;
  if (!Number.isFinite(fps) || fps <= 0) invalidFpsError(fn, fps);
  return 1000 / fps;
}

// ---------------------------------------------------------------------------
// createTicker
// ---------------------------------------------------------------------------

/**
 * Core rAF loop primitive with FPS cap, delta clamping, and strong pause.
 *
 * @remarks
 * `FrameState` is reused across frames. Do not store a reference to it.
 * Read values immediately in your `onTick` callback.
 */
export function createTicker(options: TickerOptions): Ticker {
  if (typeof requestAnimationFrame === 'undefined') {
    serverContextError('createTicker');
  }

  const { onTick, fps, signal } = options;
  let minFrameTime: number = getMinFrameTime('createTicker', fps);

  let _phase: TickerPhase = 'idle';
  let _reason: TickerReason = 'initial';

  let lastTickTime = 0;
  let nextTickTime = 0;
  let hasTickTime = false;
  let frameCount = 0;
  let pauseStartTime = 0;
  let totalPausedTime = 0;
  let startTime = 0;

  // Pre-allocated, mutated in place each frame — zero allocations per tick.
  const frame: MutableFrameState = {
    time: 0,
    delta: 0,
    elapsed: 0,
    frame: 0,
  };
  Object.seal(frame);

  function tick(now: number): boolean {
    if (hasTickTime && minFrameTime > 0 && now < nextTickTime) return false;

    const rawDelta: number = hasTickTime
      ? now - lastTickTime
      : DEFAULT_FIRST_DELTA_MS;
    hasTickTime = true;
    lastTickTime = now;

    if (minFrameTime > 0) {
      if (nextTickTime === 0) {
        nextTickTime = now + minFrameTime;
      } else {
        const intervals: number =
          Math.floor((now - nextTickTime) / minFrameTime) + 1;
        nextTickTime += intervals * minFrameTime;
      }
    }

    frame.time = now;
    frame.delta = rawDelta > MAX_DELTA_MS ? MAX_DELTA_MS : rawDelta;
    frame.elapsed = now - startTime - totalPausedTime;
    frame.frame = ++frameCount;

    onTick(frame);
    return true;
  }

  const subscription: FrameSubscription = createFrameSubscription(tick);

  function start(): void {
    if (_phase === 'running') return;
    if (_phase === 'stopped') tickerStoppedError();
    if (_phase === 'paused') {
      resume();
      return;
    }

    _phase = 'running';
    _reason = 'started';
    startTime = performance.now();
    lastTickTime = 0;
    nextTickTime = 0;
    hasTickTime = false;
    frameCount = 0;
    totalPausedTime = 0;
    resetFrameState(frame);

    joinSharedFrame(subscription);
  }

  function pause(): void {
    if (_phase !== 'running') return;

    _phase = 'paused';
    _reason = 'manual';
    pauseStartTime = performance.now();

    // Strong pause: cancel rAF subscription entirely — zero CPU while paused.
    leaveSharedFrame(subscription);
  }

  function resume(): void {
    if (_phase === 'stopped') tickerStoppedError();
    if (_phase !== 'paused') return;

    totalPausedTime += performance.now() - pauseStartTime;
    // Reset so the first resumed tick gets a clean delta (not the pause gap).
    lastTickTime = 0;
    nextTickTime = 0;
    hasTickTime = false;

    _phase = 'running';
    _reason = 'resumed';
    joinSharedFrame(subscription);
  }

  function stop(): void {
    if (_phase === 'stopped') return;

    _phase = 'stopped';
    _reason = _reason === 'initial' ? 'disposed' : 'manual';
    unlinkAbort?.();
    leaveSharedFrame(subscription);
  }

  function setFps(nextFps?: number): void {
    if (_phase === 'stopped') tickerStoppedError();
    minFrameTime = getMinFrameTime('setFps', nextFps);
    nextTickTime =
      hasTickTime && minFrameTime > 0 ? lastTickTime + minFrameTime : 0;
  }

  // Declared before assignment because an already-aborted signal makes
  // linkAbortSignal call stop() synchronously, which reads unlinkAbort.
  let unlinkAbort: (() => void) | undefined;
  unlinkAbort = linkAbortSignal(signal, stop);

  return {
    start,
    stop,
    pause,
    resume,
    setFps,
    get phase() {
      return _phase;
    },
    get phaseReason() {
      return _reason;
    },
  };
}
