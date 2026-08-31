import type { ClockCallback, InputCallback } from '.';
import { createMockRequestAnimationFrame } from '../../../__mocks__/request-animation-frame';

beforeEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('phase.clock@1'));
  Reflect.deleteProperty(globalThis, Symbol.for('phase.clock@2'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, Symbol.for('phase.clock@1'));
  Reflect.deleteProperty(globalThis, Symbol.for('phase.clock@2'));
});

async function setup() {
  const raf = createMockRequestAnimationFrame();
  vi.stubGlobal('requestAnimationFrame', raf.request);
  vi.stubGlobal('cancelAnimationFrame', raf.cancel);
  return { raf, clock: await import('.') };
}

it('dispatches input before tick with one frame-locked timestamp', async () => {
  const { raf, clock } = await setup();
  const calls: Array<[string, number]> = [];
  const tick: ClockCallback = (time) => calls.push(['tick', time]);
  const input: ClockCallback = (time) => calls.push(['input', time]);

  clock.joinTick(tick);
  clock.scheduleInput(input);
  raf.frame(123.456);

  expect(calls).toEqual([
    ['input', 123.456],
    ['tick', 123.456],
  ]);
  clock.leaveTick(tick);
});

it('drains one-shot input and stops an otherwise idle clock', async () => {
  const { raf, clock } = await setup();
  const callback = vi.fn();
  const input: ClockCallback = callback;

  clock.scheduleInput(input);
  expect(raf.pending.size).toBe(1);

  raf.frame(16);

  expect(callback).toHaveBeenCalledOnce();
  expect(raf.pending.size).toBe(0);
});

it('defers input rescheduled during dispatch until the next frame', async () => {
  const { raf, clock } = await setup();
  const callback = vi.fn(() => clock.scheduleInput(input));
  const input: ClockCallback = callback;

  clock.scheduleInput(input);
  raf.frame(16);
  expect(callback).toHaveBeenCalledOnce();
  expect(raf.pending.size).toBe(1);

  raf.frame(32);
  expect(callback).toHaveBeenCalledTimes(2);

  clock.cancelInput(input);
  expect(raf.pending.size).toBe(0);
});

it('cancels pending input without dispatching it', async () => {
  const { raf, clock } = await setup();
  const callback = vi.fn();
  const input: ClockCallback = callback;

  clock.scheduleInput(input);
  clock.cancelInput(input);

  expect(raf.pending.size).toBe(0);
  raf.frame(16);
  expect(callback).not.toHaveBeenCalled();
});

it('does not leave an idle frame scheduled when input throws', async () => {
  const { raf, clock } = await setup();
  const input = vi.fn(() => {
    throw new Error('input failed');
  });

  clock.scheduleInput(input);

  expect(() => raf.frame(16)).toThrow('input failed');
  expect(raf.pending.size).toBe(0);
});

it('does not leave an idle frame when the last input callback throws', async () => {
  const { raf, clock } = await setup();
  const first = vi.fn();
  const second = vi.fn(() => {
    throw new Error('input failed');
  });
  clock.scheduleInput(first);
  clock.scheduleInput(second);

  expect(() => raf.frame(16)).toThrow('input failed');
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(raf.pending.size).toBe(0);
});

it('does not collide with an incompatible version 1 clock record', async () => {
  const version1 = Object.freeze({ subscribers: new Set() });
  Object.defineProperty(globalThis, Symbol.for('phase.clock@1'), {
    value: version1,
    configurable: true,
  });
  const { raf, clock } = await setup();
  const input = vi.fn();

  clock.scheduleInput(input);
  raf.frame(16);

  expect(input).toHaveBeenCalledOnce();
  const registry = globalThis as unknown as Record<symbol, unknown>;
  expect(registry[Symbol.for('phase.clock@1')]).toBe(version1);
});

it.each([0, 1, 2])(
  'isolates an input error at position %i until every input and tick runs',
  async (errorIndex) => {
    const { raf, clock } = await setup();
    const calls: string[] = [];
    const inputs: InputCallback[] = [0, 1, 2].map((index) => () => {
      calls.push(`input-${index}`);
      if (index === errorIndex) throw new Error(`input-${index} failed`);
    });
    const tick = vi.fn(() => calls.push('tick'));
    for (const input of inputs) clock.scheduleInput(input);
    clock.joinTick(tick);

    expect(() => raf.frame(16)).toThrow(`input-${errorIndex} failed`);
    expect(calls).toEqual(['input-0', 'input-1', 'input-2', 'tick']);

    clock.leaveTick(tick);
    expect(raf.pending.size).toBe(0);
  },
);

it('preserves tick error precedence when input also fails', async () => {
  const { raf, clock } = await setup();
  const inputError = new Error('input failed');
  const tickError = new Error('tick failed');
  const input = vi.fn(() => {
    throw inputError;
  });
  const firstTick = vi.fn(() => {
    throw tickError;
  });
  const secondTick = vi.fn();
  clock.scheduleInput(input);
  clock.joinTick(firstTick);
  clock.joinTick(secondTick);

  expect(() => raf.frame(16)).toThrow(tickError);
  expect(input).toHaveBeenCalledOnce();
  expect(firstTick).toHaveBeenCalledOnce();
  expect(secondTick).not.toHaveBeenCalled();

  clock.leaveTick(firstTick);
  clock.leaveTick(secondTick);
});

it('keeps recurring input registered until its callback completes', async () => {
  const { raf, clock } = await setup();
  const input = vi
    .fn<InputCallback>()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(undefined);

  clock.scheduleInput(input);
  raf.frame(16);
  expect(input).toHaveBeenCalledOnce();
  expect(raf.pending.size).toBe(1);

  raf.frame(32);
  expect(input).toHaveBeenCalledTimes(2);
  expect(raf.pending.size).toBe(0);
});

it('does not delete recurring input between frames', async () => {
  const { raf, clock } = await setup();
  const callback = vi
    .fn<InputCallback>()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(undefined);
  clock.scheduleInput(callback);
  const registry = globalThis as unknown as Record<
    symbol,
    SharedClockRecord | undefined
  >;
  const shared = registry[Symbol.for('phase.clock@2')];
  if (!shared) throw new Error('clock was not initialized');
  const deleteInput = vi.spyOn(shared.input, 'delete');

  raf.frame(16);
  expect(deleteInput).not.toHaveBeenCalled();

  raf.frame(32);
  expect(deleteInput).toHaveBeenCalledOnce();
});

it('defers new input scheduled during the input stage', async () => {
  const { raf, clock } = await setup();
  const calls: string[] = [];
  const second = vi.fn(() => {
    calls.push('second');
  });
  const first = vi.fn(() => {
    calls.push('first');
    clock.scheduleInput(second);
  });
  const tick = vi.fn(() => calls.push('tick'));
  clock.scheduleInput(first);
  clock.joinTick(tick);

  raf.frame(16);
  expect(calls).toEqual(['first', 'tick']);

  raf.frame(32);
  expect(calls).toEqual(['first', 'tick', 'second', 'tick']);
  clock.leaveTick(tick);
});

it.each([
  [
    'unvisited',
    ['first', 'second', 'tick'],
    ['first', 'second', 'tick', 'tick'],
  ],
  [
    'already visited',
    ['second', 'first', 'tick'],
    ['second', 'first', 'tick', 'second', 'tick'],
  ],
] as const)(
  'coalesces work for a pending callback that is %s',
  async (position, firstFrame, secondFrame) => {
    const { raf, clock } = await setup();
    const calls: string[] = [];
    const second = vi.fn(() => {
      calls.push('second');
    });
    const first = vi.fn(() => {
      calls.push('first');
      clock.scheduleInput(second);
    });
    const tick = vi.fn(() => calls.push('tick'));
    if (position === 'unvisited') {
      clock.scheduleInput(first);
      clock.scheduleInput(second);
    } else {
      clock.scheduleInput(second);
      clock.scheduleInput(first);
    }
    clock.joinTick(tick);

    raf.frame(16);
    expect(calls).toEqual(firstFrame);

    raf.frame(32);
    expect(calls).toEqual(secondFrame);
    clock.leaveTick(tick);
  },
);

it('defers input scheduled during the tick stage', async () => {
  const { raf, clock } = await setup();
  const calls: string[] = [];
  const input = vi.fn(() => {
    calls.push('input');
  });
  const tick = vi.fn(() => {
    calls.push('tick');
    clock.scheduleInput(input);
  });
  clock.joinTick(tick);

  raf.frame(16);
  expect(calls).toEqual(['tick']);

  raf.frame(32);
  expect(calls).toEqual(['tick', 'input', 'tick']);
  clock.leaveTick(tick);
});

interface SharedClockRecord {
  input: Map<InputCallback, number>;
}
