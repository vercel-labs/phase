import { linkAbortSignal } from '../_internal/abort';
import { serverContextError, tickerStoppedError } from '../_internal/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameState {
  /** Current timestamp from performance.now(). */
  time: number;
  /** Milliseconds since last tick, clamped to 40ms. */
  delta: number;
  /** Milliseconds since start, excluding paused time. */
  elapsed: number;
  /** Frame count since start. */
  frame: number;
}

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
// Shared frame-locked clock
//
// All ticker instances subscribe to a single rAF loop so they read the same
// timestamp each frame. This prevents visual desync between multiple loops
// on the same page. The clock starts when the first subscriber joins and
// stops when the last one leaves.
// ---------------------------------------------------------------------------

let sharedTime = 0;
let sharedRafId = 0;
const sharedSubscribers = new Set<() => void>();

function sharedTick(): void {
  sharedTime = performance.now();
  for (const callback of sharedSubscribers) callback();
  if (sharedSubscribers.size > 0) {
    sharedRafId = requestAnimationFrame(sharedTick);
  }
}

function joinSharedClock(callback: () => void): () => void {
  const wasEmpty: boolean = sharedSubscribers.size === 0;
  sharedSubscribers.add(callback);

  if (wasEmpty) {
    sharedTime = performance.now();
    sharedRafId = requestAnimationFrame(sharedTick);
  }

  return () => {
    sharedSubscribers.delete(callback);
    if (sharedSubscribers.size === 0 && sharedRafId) {
      cancelAnimationFrame(sharedRafId);
      sharedRafId = 0;
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetFrameState(state: FrameState): void {
  state.time = 0;
  state.delta = 0;
  state.elapsed = 0;
  state.frame = 0;
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
  let minFrameTime: number = fps ? 1000 / fps : 0;

  let _phase: TickerPhase = 'idle';
  let _reason: TickerReason = 'initial';
  let leaveSharedClock: (() => void) | null = null;

  let lastTickTime = 0;
  let pauseStartTime = 0;
  let totalPausedTime = 0;
  let startTime = 0;

  // Pre-allocated, mutated in place each frame — zero allocations per tick.
  const frame: FrameState = { time: 0, delta: 0, elapsed: 0, frame: 0 };

  function tick(): void {
    const now: number = sharedTime;

    // FPS throttle: skip this frame if we're ahead of the target interval.
    if (minFrameTime > 0 && now - lastTickTime < minFrameTime) return;

    const rawDelta: number =
      lastTickTime === 0 ? DEFAULT_FIRST_DELTA_MS : now - lastTickTime;
    lastTickTime = now;

    frame.time = now;
    frame.delta = rawDelta > MAX_DELTA_MS ? MAX_DELTA_MS : rawDelta;
    frame.elapsed = now - startTime - totalPausedTime;
    frame.frame++;

    onTick(frame);
  }

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
    totalPausedTime = 0;
    resetFrameState(frame);

    leaveSharedClock = joinSharedClock(tick);
  }

  function pause(): void {
    if (_phase !== 'running') return;

    _phase = 'paused';
    _reason = 'manual';
    pauseStartTime = performance.now();

    // Strong pause: cancel rAF subscription entirely — zero CPU while paused.
    leaveSharedClock?.();
    leaveSharedClock = null;
  }

  function resume(): void {
    if (_phase === 'stopped') tickerStoppedError();
    if (_phase !== 'paused') return;

    totalPausedTime += performance.now() - pauseStartTime;
    // Reset so the first resumed tick gets a clean delta (not the pause gap).
    lastTickTime = 0;

    _phase = 'running';
    _reason = 'resumed';
    leaveSharedClock = joinSharedClock(tick);
  }

  function stop(): void {
    if (_phase === 'stopped') return;

    _phase = 'stopped';
    _reason = _reason === 'initial' ? 'disposed' : 'manual';
    unlinkAbort?.();
    leaveSharedClock?.();
    leaveSharedClock = null;
  }

  function setFps(nextFps?: number): void {
    minFrameTime = nextFps ? 1000 / nextFps : 0;
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
