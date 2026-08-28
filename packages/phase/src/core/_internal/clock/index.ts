export type ClockCallback = (time: number) => void;

interface SharedClock {
  rafId: number | null;
  frame: number;
  time: number;
  ticks: Map<ClockCallback, number>;
  input: Map<ClockCallback, number>;
}

let sharedClock: SharedClock;

function getSharedClock(): SharedClock {
  const registry = globalThis as unknown as Record<
    symbol,
    SharedClock | undefined
  >;
  const clock = (registry[Symbol.for('phase.clock@1')] ??= {
    rafId: null,
    frame: 0,
    time: 0,
    ticks: new Map<ClockCallback, number>(),
    input: new Map<ClockCallback, number>(),
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

function dispatchInput(joinedFrame: number, callback: ClockCallback): void {
  if (joinedFrame < sharedClock.frame) {
    sharedClock.input.delete(callback);
    callback(sharedClock.time);
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
  sharedClock.rafId =
    sharedClock.ticks.size === 0 && sharedClock.input.size < 2
      ? null
      : requestAnimationFrame(tick);
  // eslint-disable-next-line unicorn/no-array-for-each -- Map#forEach avoids a per-frame iterator.
  sharedClock.input.forEach(dispatchInput);
  // eslint-disable-next-line unicorn/no-array-for-each -- Map#forEach avoids a per-frame iterator.
  sharedClock.ticks.forEach(dispatchTick);
  stopIfEmpty();
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

export function scheduleInput(callback: ClockCallback): void {
  sharedClock ??= getSharedClock();
  if (sharedClock.input.has(callback)) return;
  sharedClock.input.set(callback, sharedClock.frame);
  scheduleFrame();
}

export function cancelInput(callback: ClockCallback): void {
  if (!sharedClock) return;
  sharedClock.input.delete(callback);
  stopIfEmpty();
}
