import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';

// jsdom lacks PointerEvent — provide a minimal polyfill
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as Record<string, unknown>).PointerEvent =
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly width: number;
      readonly height: number;
      readonly pressure: number;
      readonly tiltX: number;
      readonly tiltY: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      constructor(type: string, init?: PointerEventInit) {
        super(type, init);
        this.pointerId = init?.pointerId ?? 0;
        this.width = init?.width ?? 1;
        this.height = init?.height ?? 1;
        this.pressure = init?.pressure ?? 0;
        this.tiltX = init?.tiltX ?? 0;
        this.tiltY = init?.tiltY ?? 0;
        this.pointerType = init?.pointerType ?? 'mouse';
        this.isPrimary = init?.isPrimary ?? false;
      }
    };
}

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let rafCallbacks: Array<FrameRequestCallback>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });

  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks[id - 1] = () => undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function flushRAF(): void {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) cb(performance.now());
}

async function getModule() {
  return import('.');
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts idle', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const pointer = createPointer({
      element: el,
      onPointer: vi.fn(),
      visibility: 'ignore',
    });
    expect(pointer.phase).toBe('idle');
    expect(pointer.phaseReason).toBe('initial');
    expect(pointer.state.active).toBe(false);
    pointer.stop();
  });
});

// ---------------------------------------------------------------------------
// Pointer events and rAF batching
// ---------------------------------------------------------------------------

describe('pointer events', () => {
  it('tracks pointer enter and leave', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const pointer = createPointer({
      element: el,
      onPointer: cb,
      visibility: 'ignore',
    });

    el.dispatchEvent(new Event('pointerenter'));
    expect(pointer.phase).toBe('tracking');
    expect(pointer.state.active).toBe(true);

    el.dispatchEvent(new Event('pointerleave'));
    expect(pointer.phase).toBe('idle');
    expect(pointer.state.active).toBe(false);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    pointer.stop();
  });

  it('batches pointermove into rAF', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');

    el.getBoundingClientRect = () => ({
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      top: 20,
      left: 10,
      right: 110,
      bottom: 120,
      toJSON: () => undefined,
    });

    const cb = vi.fn();
    const pointer = createPointer({
      element: el,
      onPointer: cb,
      visibility: 'ignore',
    });

    el.dispatchEvent(new Event('pointerenter'));

    el.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 50, clientY: 60 }),
    );
    el.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 55, clientY: 65 }),
    );

    expect(cb).toHaveBeenCalledTimes(0);

    flushRAF();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(pointer.state.x).toBe(45); // 55 - 10
    expect(pointer.state.y).toBe(45); // 65 - 20
    pointer.stop();
  });

  it('cancels a pending rAF flush when the pointer leaves', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const pointer = createPointer({
      element: el,
      onPointer: cb,
      visibility: 'ignore',
    });

    el.dispatchEvent(new Event('pointerenter'));
    el.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 50, clientY: 60 }),
    );
    expect(cb).toHaveBeenCalledTimes(0);

    // Leave before the scheduled frame runs: reports once, synchronously.
    el.dispatchEvent(new Event('pointerleave'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false }),
    );

    // The stale frame must not fire a redundant callback.
    flushRAF();
    expect(cb).toHaveBeenCalledTimes(1);
    pointer.stop();
  });
});

// ---------------------------------------------------------------------------
// Visibility gating
// ---------------------------------------------------------------------------

describe('visibility gating', () => {
  it('does not attach listeners until visible', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const pointer = createPointer({
      element: el,
      onPointer: cb,
    });

    el.dispatchEvent(new Event('pointerenter'));
    expect(pointer.phase).toBe('idle');

    mockIO.trigger(el, true);

    el.dispatchEvent(new Event('pointerenter'));
    expect(pointer.phase).toBe('tracking');
    pointer.stop();
  });

  it('detaches listeners when element leaves viewport', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const pointer = createPointer({
      element: el,
      onPointer: vi.fn(),
    });

    mockIO.trigger(el, true);
    el.dispatchEvent(new Event('pointerenter'));
    expect(pointer.phase).toBe('tracking');

    mockIO.trigger(el, false);
    expect(pointer.state.active).toBe(false);
    expect(pointer.phaseReason).toBe('sight');
    pointer.stop();
  });
});

// ---------------------------------------------------------------------------
// Stop / teardown
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('sets phase to stopped', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const pointer = createPointer({
      element: el,
      onPointer: vi.fn(),
      visibility: 'ignore',
    });
    pointer.stop();
    expect(pointer.phase).toBe('stopped');
    expect(pointer.phaseReason).toBe('disposed');
  });

  it('stop is idempotent', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const pointer = createPointer({
      element: el,
      onPointer: vi.fn(),
      visibility: 'ignore',
    });
    pointer.stop();
    expect(() => pointer.stop()).not.toThrow();
  });

  it('aborting the signal stops the tracker', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const controller = new AbortController();
    const pointer = createPointer({
      element: el,
      onPointer: vi.fn(),
      signal: controller.signal,
      visibility: 'ignore',
    });
    controller.abort();
    expect(pointer.phase).toBe('stopped');
  });

  it('no callbacks fire after stop', async () => {
    const { createPointer } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const pointer = createPointer({
      element: el,
      onPointer: cb,
      visibility: 'ignore',
    });

    el.dispatchEvent(new Event('pointerenter'));
    pointer.stop();
    cb.mockClear();

    el.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 50, clientY: 60 }),
    );
    flushRAF();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error guards
// ---------------------------------------------------------------------------

describe('error guards', () => {
  it('throws no_element when element is null', async () => {
    const { createPointer } = await getModule();
    expect(() =>
      createPointer({
        // @ts-expect-error — testing the runtime guard
        element: null,
        onPointer: vi.fn(),
      }),
    ).toThrowError(/DOM element/);
  });
});
