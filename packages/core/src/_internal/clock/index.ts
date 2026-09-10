export type ClockCallback = (time: number) => void;
export type InputCallback = (time: number) => unknown;

const EXECUTING = -1;
const RESCHEDULED = -2;

interface SharedClock {
  rafId: number | null;
  frame: number;
  time: number;
  ticks: Map<ClockCallback, number>;
  input: Map<InputCallback, number>;
}

let sharedClock: SharedClock;
let inputError: unknown;
let inputFailed = false;

function getSharedClock(): SharedClock {
  const registry = globalThis as unknown as Record<
    symbol,
    SharedClock | undefined
  >;
  const clock = (registry[Symbol.for('phase.clock@2')] ??= {
    rafId: null,
    frame: 0,
    time: 0,
    ticks: new Map<ClockCallback, number>(),
    input: new Map<InputCallback, number>(),
  });
  return clock;
}

function stopIfEmpty(): void {
  if (
    sharedClock.ticks.size === 0 &&
    sharedClock.input.size === 0 &&
    sharedClock.rafId !== null
  ) {
    cancelAnimationFrame(sharedClock.rafId);
    sharedClock.rafId = null;
  }
}

function dispatchInput(joinedFrame: number, callback: InputCallback): void {
  if (joinedFrame < sharedClock.frame) {
    sharedClock.input.set(callback, EXECUTING);
    let keep = false;
    try {
      keep = callback(sharedClock.time) === true;
    } catch (error) {
      if (!inputFailed) inputError = error;
      inputFailed = true;
    }
    const state = sharedClock.input.get(callback);
    if (state !== undefined && (keep || state !== EXECUTING)) {
      sharedClock.input.set(callback, sharedClock.frame);
      scheduleFrame();
    } else {
      sharedClock.input.delete(callback);
    }
  }
}

function dispatchTick(joinedFrame: number, callback: ClockCallback): void {
  if (joinedFrame < sharedClock.frame) {
    callback(sharedClock.time);
  }
}

function tick(time: number): void {
  sharedClock.time = time;
  sharedClock.frame++;
  inputFailed = false;
  sharedClock.rafId =
    sharedClock.ticks.size === 0 ? null : requestAnimationFrame(tick);
  // eslint-disable-next-line unicorn/no-array-for-each -- Map#forEach avoids a per-frame iterator.
  sharedClock.input.forEach(dispatchInput);
  const failed = inputFailed;
  const error = inputError;
  inputFailed = false;
  inputError = undefined;
  // eslint-disable-next-line unicorn/no-array-for-each -- Map#forEach avoids a per-frame iterator.
  sharedClock.ticks.forEach(dispatchTick);
  stopIfEmpty();
  if (failed) throw error;
}

function scheduleFrame(): void {
  if (sharedClock.rafId === null) {
    sharedClock.rafId = requestAnimationFrame(tick);
  }
}

export function joinTick(callback: ClockCallback): void {
  sharedClock ??= getSharedClock();
  sharedClock.ticks.set(callback, sharedClock.frame);
  scheduleFrame();
}

export function leaveTick(callback: ClockCallback): void {
  if (!sharedClock) return;
  sharedClock.ticks.delete(callback);
  stopIfEmpty();
}

export function scheduleInput(callback: InputCallback): void {
  sharedClock ??= getSharedClock();
  const state = sharedClock.input.get(callback);
  if (state === EXECUTING) {
    sharedClock.input.set(callback, RESCHEDULED);
    scheduleFrame();
    return;
  }
  if (state !== undefined) return;
  sharedClock.input.set(callback, sharedClock.frame);
  scheduleFrame();
}

export function cancelInput(callback: InputCallback): void {
  if (!sharedClock) return;
  sharedClock.input.delete(callback);
  stopIfEmpty();
}
