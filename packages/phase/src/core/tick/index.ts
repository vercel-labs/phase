import { linkAbortSignal } from '../_internal/abort';
import {
  invalidFpsError,
  serverContextError,
  tickerStoppedError,
} from '../_internal/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameState {
  /** Current browser requestAnimationFrame timestamp. */
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
   * Change the FPS cap without resetting the timeline. `undefined` uncaps,
   * matching `TickerOptions.fps`. The new cap takes effect on the next
   * eligible source frame. Throws on a stopped ticker or an invalid fps,
   * leaving the previous cap unchanged.
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

interface SharedSubscription {
  callback: (time: number) => void;
  joinedFrame: number;
}

let sharedRafId: number | null = null;
let sharedFrame = 0;
let sharedTime = 0;
const sharedSubscribers = new Set<SharedSubscription>();

function dispatchSharedSubscription(subscription: SharedSubscription): void {
  if (subscription.joinedFrame < sharedFrame) {
    subscription.callback(sharedTime);
  }
}

function sharedTick(time: number): void {
  sharedTime = time;
  sharedFrame++;
  sharedRafId = requestAnimationFrame(sharedTick);
  // eslint-disable-next-line unicorn/no-array-for-each -- Set#forEach avoids a per-frame iterator.
  sharedSubscribers.forEach(dispatchSharedSubscription);
}

function joinSharedClock(subscription: SharedSubscription): void {
  const wasEmpty: boolean = sharedSubscribers.size === 0;
  subscription.joinedFrame = sharedFrame;
  sharedSubscribers.add(subscription);

  if (wasEmpty) {
    sharedRafId = requestAnimationFrame(sharedTick);
  }
}

function leaveSharedClock(subscription: SharedSubscription): void {
  sharedSubscribers.delete(subscription);
  if (sharedSubscribers.size === 0 && sharedRafId !== null) {
    cancelAnimationFrame(sharedRafId);
    sharedRafId = null;
  }
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

/** Validate an FPS cap and convert it to a minimum frame interval (0 = uncapped). */
function resolveMinFrameTime(fn: string, fps: number | undefined): number {
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

  const { onTick, signal } = options;
  let minFrameTime: number = resolveMinFrameTime('createTicker', options.fps);

  let _phase: TickerPhase = 'idle';
  let _reason: TickerReason = 'initial';

  let lastTickTime = 0;
  let pauseStartTime = 0;
  let totalPausedTime = 0;
  let startTime = 0;

  // Deadline for the next capped delivery. Advanced on the cap's grid (never
  // re-anchored at delivery time) so late source frames retain the residual
  // instead of drifting the effective rate downward. 0 while uncapped.
  let nextDueTime = 0;

  // Pre-allocated, mutated in place each frame — zero allocations per tick.
  const frame: FrameState = { time: 0, delta: 0, elapsed: 0, frame: 0 };

  function tick(now: number): void {
    // FPS throttle: skip this frame if the cap's deadline hasn't arrived.
    if (now < nextDueTime) return;

    const isFirstDelivery: boolean = lastTickTime === 0;
    const rawDelta: number = isFirstDelivery
      ? DEFAULT_FIRST_DELTA_MS
      : now - lastTickTime;
    lastTickTime = now;

    if (minFrameTime > 0) {
      if (isFirstDelivery) {
        // Anchor the cadence grid at the first delivery after (re)start.
        nextDueTime = now + minFrameTime;
      } else {
        nextDueTime += minFrameTime;
        const behind: number = now - nextDueTime;
        if (behind >= minFrameTime) {
          // A stall left whole slots unfilled. Forfeit them (no catch-up
          // burst) while keeping the grid phase.
          nextDueTime += Math.floor(behind / minFrameTime) * minFrameTime;
        }
      }
    }

    frame.time = now;
    frame.delta = rawDelta > MAX_DELTA_MS ? MAX_DELTA_MS : rawDelta;
    frame.elapsed = now - startTime - totalPausedTime;
    frame.frame++;

    onTick(frame);
  }

  const subscription: SharedSubscription = { callback: tick, joinedFrame: 0 };

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
    nextDueTime = 0;
    totalPausedTime = 0;
    resetFrameState(frame);

    joinSharedClock(subscription);
  }

  function pause(): void {
    if (_phase !== 'running') return;

    _phase = 'paused';
    _reason = 'manual';
    pauseStartTime = performance.now();

    // Strong pause: cancel rAF subscription entirely — zero CPU while paused.
    leaveSharedClock(subscription);
  }

  function resume(): void {
    if (_phase === 'stopped') tickerStoppedError();
    if (_phase !== 'paused') return;

    totalPausedTime += performance.now() - pauseStartTime;
    // Reset so the first resumed tick gets a clean delta (not the pause gap)
    // and delivers immediately, re-anchoring the cadence grid.
    lastTickTime = 0;
    nextDueTime = 0;

    _phase = 'running';
    _reason = 'resumed';
    joinSharedClock(subscription);
  }

  function setFps(fps?: number): void {
    if (_phase === 'stopped') tickerStoppedError();
    minFrameTime = resolveMinFrameTime('setFps', fps);
    // Re-derive the deadline from the last delivery so the new cap takes
    // effect on the next eligible source frame without an uncapped
    // transition frame. Timeline and last-delivery history are untouched.
    nextDueTime = lastTickTime === 0 ? 0 : lastTickTime + minFrameTime;
  }

  function stop(): void {
    if (_phase === 'stopped') return;

    _phase = 'stopped';
    _reason = _reason === 'initial' ? 'disposed' : 'manual';
    unlinkAbort?.();
    leaveSharedClock(subscription);
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
