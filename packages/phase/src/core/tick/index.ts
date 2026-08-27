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
  /** Milliseconds to advance this frame. At most 40ms, or one FPS interval plus 40ms. */
  delta: number;
  /** Sum of delivered deltas since start. */
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
   * Change the FPS cap. `undefined` removes it. The running timeline is
   * untouched: frame count, elapsed, and pause accounting all continue.
   * Throws on a stopped ticker or an fps that is not a finite number
   * greater than 0, leaving the previous cap in place.
   */
  setFps(fps?: number): void;
  readonly phase: TickerPhase;
  readonly phaseReason: TickerReason;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum amount delta may exceed the active FPS interval. */
const MAX_DELTA_MS = 40;

/** Default first-frame delta when no previous tick exists. */
const DEFAULT_FIRST_DELTA_MS = 16.67;

// ---------------------------------------------------------------------------
// Shared frame-locked clock
//
// All ticker instances subscribe to a single rAF loop so they read the same
// timestamp each frame. Separately bundled copies in the same JavaScript
// global share this clock. It starts when the first subscriber joins and stops
// when the last one leaves.
// ---------------------------------------------------------------------------

interface SharedSubscription {
  callback: (time: number) => void;
  joinedFrame: number;
}

interface SharedClock {
  rafId: number | null;
  frame: number;
  time: number;
  subscribers: Set<SharedSubscription>;
}

let sharedClock: SharedClock;

function getSharedClock(): SharedClock {
  const registry = globalThis as unknown as Record<
    symbol,
    SharedClock | undefined
  >;
  return (registry[Symbol.for('phase.clock@1')] ??= {
    rafId: null,
    frame: 0,
    time: 0,
    subscribers: new Set<SharedSubscription>(),
  });
}

function dispatchSharedSubscription(subscription: SharedSubscription): void {
  if (subscription.joinedFrame < sharedClock.frame) {
    subscription.callback(sharedClock.time);
  }
}

function sharedTick(time: number): void {
  sharedClock.time = time;
  sharedClock.frame++;
  sharedClock.rafId = requestAnimationFrame(sharedTick);
  // eslint-disable-next-line unicorn/no-array-for-each -- Set#forEach avoids a per-frame iterator.
  sharedClock.subscribers.forEach(dispatchSharedSubscription);
}

function joinSharedClock(subscription: SharedSubscription): void {
  const wasEmpty: boolean = sharedClock.subscribers.size === 0;
  subscription.joinedFrame = sharedClock.frame;
  sharedClock.subscribers.add(subscription);

  if (wasEmpty) {
    sharedClock.rafId = requestAnimationFrame(sharedTick);
  }
}

function leaveSharedClock(subscription: SharedSubscription): void {
  sharedClock.subscribers.delete(subscription);
  if (sharedClock.subscribers.size === 0 && sharedClock.rafId !== null) {
    cancelAnimationFrame(sharedClock.rafId);
    sharedClock.rafId = null;
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

/**
 * Advance a capped delivery deadline by one interval. Deadlines move in whole
 * intervals from a fixed anchor, so a slightly-late browser frame never pushes
 * later deadlines back (that drift is how a 60fps cap decays to ~30fps).
 */
function advanceDeadline(
  deadline: number,
  now: number,
  interval: number,
): number {
  const next: number = deadline + interval;
  const behind: number = now - next;
  if (behind < interval) return next;
  // A stall left whole intervals unfilled. Skip them, so delivery resumes at
  // the cap's pace instead of bursting to catch up.
  return next + Math.floor(behind / interval) * interval;
}

// ---------------------------------------------------------------------------
// createTicker
// ---------------------------------------------------------------------------

/**
 * Low-level requestAnimationFrame loop with an optional FPS limit and pause controls.
 *
 * @remarks
 * `FrameState` is reused across frames. Do not store a reference to it.
 * Read values immediately in your `onTick` callback.
 */
export function createTicker(options: TickerOptions): Ticker {
  if (typeof requestAnimationFrame === 'undefined') {
    serverContextError('createTicker');
  }
  sharedClock ??= getSharedClock();

  const { onTick, signal } = options;
  let minFrameTime: number = resolveMinFrameTime('createTicker', options.fps);
  let maxDeltaTime: number = minFrameTime + MAX_DELTA_MS;

  let _phase: TickerPhase = 'idle';
  let _reason: TickerReason = 'initial';

  let lastTickTime = -1;
  let elapsedTime = 0;
  let frameCount = 0;

  // When the next capped delivery becomes eligible (see advanceDeadline).
  // 0 while uncapped.
  let nextDueTime = 0;

  // Pre-allocated, mutated in place each frame — zero allocations per tick.
  const frame: FrameState = { time: 0, delta: 0, elapsed: 0, frame: 0 };

  function tick(now: number): void {
    // FPS throttle: skip this frame if the cap's deadline hasn't arrived.
    if (now < nextDueTime) return;

    const isFirstDelivery: boolean = lastTickTime < 0;
    const rawDelta: number = isFirstDelivery
      ? minFrameTime || DEFAULT_FIRST_DELTA_MS
      : now - lastTickTime;
    lastTickTime = now;

    if (minFrameTime > 0) {
      nextDueTime = isFirstDelivery
        ? now + minFrameTime // the first delivery after (re)start anchors the deadlines
        : advanceDeadline(nextDueTime, now, minFrameTime);
    }

    frame.time = now;
    frame.delta = rawDelta > maxDeltaTime ? maxDeltaTime : rawDelta;
    elapsedTime += frame.delta;
    frame.elapsed = elapsedTime;
    frameCount++;
    frame.frame = frameCount;

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
    lastTickTime = -1;
    nextDueTime = 0;
    elapsedTime = 0;
    frameCount = 0;
    resetFrameState(frame);

    joinSharedClock(subscription);
  }

  function pause(): void {
    if (_phase !== 'running') return;

    _phase = 'paused';
    _reason = 'manual';

    // Strong pause: cancel rAF subscription entirely — zero CPU while paused.
    leaveSharedClock(subscription);
  }

  function resume(): void {
    if (_phase === 'stopped') tickerStoppedError();
    if (_phase !== 'paused') return;

    // Reset so the first resumed tick gets a clean delta (not the pause gap)
    // and delivers immediately, re-anchoring the cadence grid.
    lastTickTime = -1;
    nextDueTime = 0;

    _phase = 'running';
    _reason = 'resumed';
    joinSharedClock(subscription);
  }

  function setFps(fps?: number): void {
    if (_phase === 'stopped') tickerStoppedError();
    const nextMinFrameTime: number = resolveMinFrameTime('setFps', fps);
    minFrameTime = nextMinFrameTime;
    maxDeltaTime = nextMinFrameTime + MAX_DELTA_MS;
    // Base the next deadline on the last delivery: the new cap applies from
    // the next frame, and never sooner than the new interval allows.
    nextDueTime = lastTickTime < 0 ? 0 : lastTickTime + minFrameTime;
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
