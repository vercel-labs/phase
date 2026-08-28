import type { ClockCallback } from '.';
import { createMockRequestAnimationFrame } from '../../../__mocks__/request-animation-frame';

beforeEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('phase.clock@1'));
});

afterEach(() => {
  vi.unstubAllGlobals();
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

it('continues pending input on the next frame when an earlier callback throws', async () => {
  const { raf, clock } = await setup();
  const first = vi.fn(() => {
    throw new Error('input failed');
  });
  const second = vi.fn();
  clock.scheduleInput(first);
  clock.scheduleInput(second);

  expect(() => raf.frame(16)).toThrow('input failed');
  expect(second).not.toHaveBeenCalled();
  expect(raf.pending.size).toBe(1);

  raf.frame(32);
  expect(second).toHaveBeenCalledOnce();
  expect(raf.pending.size).toBe(0);
});
