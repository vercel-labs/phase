import { createMockRequestAnimationFrame } from '../__mocks__/request-animation-frame';
import { createMockResizeObserver } from '../__mocks__/resize-observer';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('ResizeObserver', createMockResizeObserver().MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('avoids the stale-then-fresh pointer sequence across frames', async () => {
  const raf = createMockRequestAnimationFrame();
  vi.stubGlobal('requestAnimationFrame', raf.request);
  vi.stubGlobal('cancelAnimationFrame', raf.cancel);

  const { createPointer, createTicker } = await import('../index');
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;

  const pointer = createPointer({
    target: element,
    visibility: 'ignore',
    onPointer: () => undefined,
  });
  const observedX: number[] = [];
  const ticker = createTicker({
    onTick: () => {
      observedX.push(pointer.state.x);
    },
  });

  ticker.start();
  element.dispatchEvent(new Event('pointerenter'));
  element.dispatchEvent(
    new MouseEvent('pointermove', { clientX: 52, clientY: 63 }),
  );

  raf.frame(16);
  raf.frame(32);

  expect(observedX).toEqual([42, 42]);
  ticker.stop();
  pointer.stop();
});

it('flushes every event-derived primitive before tick across varied event timing', async () => {
  const raf = createMockRequestAnimationFrame();
  vi.stubGlobal('requestAnimationFrame', raf.request);
  vi.stubGlobal('cancelAnimationFrame', raf.cancel);

  const {
    createMutation,
    createPointer,
    createScroll,
    createThrottle,
    createTicker,
  } = await import('../index');
  const order: string[] = [];

  const pointerElement = document.createElement('div');
  pointerElement.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
  const pointer = createPointer({
    target: pointerElement,
    visibility: 'ignore',
    onPointer: () => order.push('pointer'),
  });
  pointerElement.dispatchEvent(new Event('pointerenter'));

  const scrollElement = document.createElement('div');
  Object.defineProperties(scrollElement, {
    clientHeight: { value: 100 },
    clientWidth: { value: 100 },
    scrollHeight: { value: 200 },
    scrollWidth: { value: 200 },
  });
  const scroll = createScroll({
    target: scrollElement,
    visibility: 'ignore',
    onScroll: () => order.push('scroll'),
  });

  const mutationElement = document.createElement('div');
  const mutation = createMutation({
    target: mutationElement,
    mutation: { childList: true },
    visibility: 'ignore',
    onMutations: () => order.push('mutation'),
  });

  const throttle = createThrottle({
    interval: 0,
    edge: 'trailing',
    callback: () => order.push('throttle'),
  });
  const ticker = createTicker({ onTick: () => order.push('tick') });
  ticker.start();
  order.length = 0;

  const enqueue: Array<[string, () => void]> = [
    [
      'pointer',
      () =>
        pointerElement.dispatchEvent(
          new MouseEvent('pointermove', { clientX: 10, clientY: 20 }),
        ),
    ],
    ['scroll', () => scrollElement.dispatchEvent(new Event('scroll'))],
    ['mutation', () => mutationElement.append(document.createElement('span'))],
    ['throttle', () => throttle.call()],
  ];
  const observedInputs = new Set<string>();
  let seed = 0x2048;

  for (let frame = 1; frame <= 100; frame++) {
    order.length = 0;
    for (let i = enqueue.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const j = seed % (i + 1);
      const current = enqueue[i] as (typeof enqueue)[number];
      enqueue[i] = enqueue[j] as (typeof enqueue)[number];
      enqueue[j] = current;
    }
    const expectedInputs = new Set<string>();
    for (const [name, schedule] of enqueue) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      if (seed % 3 === 0) continue;
      expectedInputs.add(name);
      observedInputs.add(name);
      schedule();
    }
    // eslint-disable-next-line no-await-in-loop -- each mutation must enqueue before its frame dispatches.
    await Promise.resolve();

    raf.frame(frame * 16);

    expect(order).toHaveLength(expectedInputs.size + 1);
    expect(order.at(-1)).toBe('tick');
    expect(new Set(order.slice(0, -1))).toEqual(expectedInputs);
  }

  expect(observedInputs).toEqual(
    new Set(['pointer', 'scroll', 'mutation', 'throttle']),
  );

  ticker.stop();
  pointer.stop();
  scroll.stop();
  mutation.stop();
  throttle.stop();
  expect(raf.pending.size).toBe(0);
});
