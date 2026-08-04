import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockResizeObserver } from '../../__mocks__/resize-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockRO: ReturnType<typeof createMockResizeObserver>;
let rafCallbacks: Array<FrameRequestCallback>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockRO = createMockResizeObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
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

interface Geometry {
  scrollWidth?: number;
  clientWidth?: number;
  scrollHeight?: number;
  clientHeight?: number;
  scrollLeft?: number;
  scrollTop?: number;
}

/** Give a detached jsdom element mutable scroll geometry (jsdom reports 0). */
function makeScrollable(
  el: HTMLElement,
  geo: Geometry,
): { setLeft(v: number): void } {
  let left = geo.scrollLeft ?? 0;
  let top = geo.scrollTop ?? 0;
  const define = (key: string, value: number) =>
    Object.defineProperty(el, key, { value, configurable: true });
  define('scrollWidth', geo.scrollWidth ?? 0);
  define('clientWidth', geo.clientWidth ?? 0);
  define('scrollHeight', geo.scrollHeight ?? 0);
  define('clientHeight', geo.clientHeight ?? 0);
  Object.defineProperty(el, 'scrollLeft', {
    get: () => left,
    set: (v: number) => {
      left = v;
    },
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: (v: number) => {
      top = v;
    },
    configurable: true,
  });
  return { setLeft: (v: number) => (el.scrollLeft = v) };
}

async function getModule() {
  return import('.');
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('measures and reports geometry on attach (visibility ignore)', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();

    const scroll = createScroll({
      element: el,
      onScroll: cb,
      visibility: 'ignore',
    });

    expect(scroll.phase).toBe('tracking');
    expect(scroll.phaseReason).toBe('started');
    expect(scroll.state.maxX).toBe(300);
    expect(scroll.state.visibleX).toBe(0.25); // 100 / 400
    expect(cb).toHaveBeenCalledTimes(1);
    scroll.stop();
  });

  it('reports maxX 0 and progress 0 when not scrollable', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 100, clientWidth: 100 });

    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });

    expect(scroll.state.maxX).toBe(0);
    expect(scroll.state.progressX).toBe(0);
    expect(scroll.state.visibleX).toBe(1);
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// Scroll events and rAF batching
// ---------------------------------------------------------------------------

describe('scroll events', () => {
  it('batches scroll events into one rAF flush', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    const geo = makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();

    const scroll = createScroll({
      element: el,
      onScroll: cb,
      visibility: 'ignore',
    });
    cb.mockClear(); // ignore the initial measure emit

    geo.setLeft(150);
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scroll'));
    expect(cb).toHaveBeenCalledTimes(0);

    flushRAF();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(scroll.state.x).toBe(150);
    expect(scroll.state.progressX).toBeCloseTo(0.5); // 150 / 300
    scroll.stop();
  });

  it('clamps scroll position to [0, max]', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    const geo = makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });

    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });

    geo.setLeft(-50); // overscroll bounce
    el.dispatchEvent(new Event('scroll'));
    flushRAF();
    expect(scroll.state.x).toBe(0);

    geo.setLeft(9999);
    el.dispatchEvent(new Event('scroll'));
    flushRAF();
    expect(scroll.state.x).toBe(300);
    expect(scroll.state.progressX).toBe(1);
    scroll.stop();
  });

  it('does not re-read geometry on the scroll path', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    const geo = makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });

    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    expect(scroll.state.maxX).toBe(300);

    // Change geometry WITHOUT calling measure(): the scroll path must keep
    // using the cached maxX (300), proving scrollWidth is not read per scroll.
    Object.defineProperty(el, 'scrollWidth', {
      value: 1000,
      configurable: true,
    });
    geo.setLeft(150);
    el.dispatchEvent(new Event('scroll'));
    flushRAF();

    expect(scroll.state.maxX).toBe(300);
    expect(scroll.state.progressX).toBeCloseTo(0.5); // 150 / 300, not 150 / 900
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// Geometry: measure() + ResizeObserver
// ---------------------------------------------------------------------------

describe('geometry', () => {
  it('measure() re-reads geometry and emits', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();

    const scroll = createScroll({
      element: el,
      onScroll: cb,
      visibility: 'ignore',
    });
    cb.mockClear();

    Object.defineProperty(el, 'scrollWidth', {
      value: 900,
      configurable: true,
    });
    scroll.measure();

    expect(scroll.state.maxX).toBe(800);
    expect(cb).toHaveBeenCalledTimes(1);
    scroll.stop();
  });

  it('re-measures on ResizeObserver callback', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });

    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    expect(scroll.state.maxX).toBe(300);

    Object.defineProperty(el, 'clientWidth', {
      value: 250,
      configurable: true,
    });
    mockRO.trigger(el, 250, 50);

    expect(scroll.state.maxX).toBe(150); // 400 - 250
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// Visibility gating
// ---------------------------------------------------------------------------

describe('visibility gating', () => {
  it('does not track until visible', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();

    const scroll = createScroll({ element: el, onScroll: cb });
    expect(scroll.phase).toBe('paused');
    expect(cb).toHaveBeenCalledTimes(0);

    mockIO.trigger(el, true);
    expect(scroll.phase).toBe('tracking');
    expect(scroll.phaseReason).toBe('started');
    expect(cb).toHaveBeenCalledTimes(1); // initial measure on attach
    scroll.stop();
  });

  it('pauses when the element leaves the viewport', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });

    const scroll = createScroll({ element: el, onScroll: vi.fn() });
    mockIO.trigger(el, true);
    expect(scroll.phase).toBe('tracking');

    mockIO.trigger(el, false);
    expect(scroll.phase).toBe('paused');
    expect(scroll.phaseReason).toBe('sight');
    scroll.stop();
  });

  it('does not flush scroll events while paused', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    const geo = makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();

    const scroll = createScroll({ element: el, onScroll: cb });
    // Never became visible: scroll listener is not attached.
    geo.setLeft(150);
    el.dispatchEvent(new Event('scroll'));
    flushRAF();
    expect(cb).toHaveBeenCalledTimes(0);
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// Stop / teardown
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('sets phase to stopped', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    scroll.stop();
    expect(scroll.phase).toBe('stopped');
    expect(scroll.phaseReason).toBe('disposed');
  });

  it('is idempotent', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    scroll.stop();
    expect(() => scroll.stop()).not.toThrow();
  });

  it('aborting the signal stops the tracker', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const controller = new AbortController();
    const scroll = createScroll({
      element: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
      signal: controller.signal,
    });
    controller.abort();
    expect(scroll.phase).toBe('stopped');
  });

  it('fires no callbacks after stop', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    const geo = makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();
    const scroll = createScroll({
      element: el,
      onScroll: cb,
      visibility: 'ignore',
    });

    scroll.stop();
    cb.mockClear();

    geo.setLeft(150);
    el.dispatchEvent(new Event('scroll'));
    flushRAF();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error guards
// ---------------------------------------------------------------------------

describe('error guards', () => {
  it('throws no_element when element is null', async () => {
    const { createScroll } = await getModule();
    expect(() =>
      createScroll({
        // @ts-expect-error — testing the runtime guard
        element: null,
        onScroll: vi.fn(),
      }),
    ).toThrowError(/DOM element/);
  });
});
