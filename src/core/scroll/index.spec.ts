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

/** How many times a listener spy saw a given event type. */
function countCalls(
  spy: { mock: { calls: Array<[unknown, ...unknown[]]> } },
  type: string,
): number {
  return spy.mock.calls.filter(([t]) => t === type).length;
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
      target: el,
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
      target: el,
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
      target: el,
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
      target: el,
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
      target: el,
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
      target: el,
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
      target: el,
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

    const scroll = createScroll({ target: el, onScroll: cb });
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

    const scroll = createScroll({ target: el, onScroll: vi.fn() });
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

    const scroll = createScroll({ target: el, onScroll: cb });
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
      target: el,
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
      target: el,
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
      target: el,
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
      target: el,
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
  it('throws no_target when target is null', async () => {
    const { createScroll } = await getModule();
    expect(() =>
      createScroll({
        // @ts-expect-error testing the runtime guard
        target: null,
        onScroll: vi.fn(),
      }),
    ).toThrowError(/target/);
  });
});

// ---------------------------------------------------------------------------
// Geometry is read only on measure, never on the scroll path
// ---------------------------------------------------------------------------

describe('geometry read discipline', () => {
  it('reads scrollWidth/clientWidth only on measure, never per scroll', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    let geoReads = 0;
    let left = 0;
    const countingGetter = (key: string, value: number) =>
      Object.defineProperty(el, key, {
        get: () => {
          geoReads++;
          return value;
        },
        configurable: true,
      });
    countingGetter('scrollWidth', 400);
    countingGetter('clientWidth', 100);
    countingGetter('scrollHeight', 0);
    countingGetter('clientHeight', 0);
    Object.defineProperty(el, 'scrollLeft', {
      get: () => left,
      set: (v: number) => {
        left = v;
      },
      configurable: true,
    });
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

    const scroll = createScroll({
      target: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });

    const afterAttach = geoReads; // one measure() on attach = 4 geometry reads
    expect(afterAttach).toBe(4);

    for (let i = 0; i < 5; i++) {
      left = i * 10;
      el.dispatchEvent(new Event('scroll'));
      flushRAF();
    }
    expect(geoReads).toBe(afterAttach); // scroll path reads zero geometry

    scroll.measure();
    expect(geoReads).toBe(afterAttach + 4); // one measure = one read each
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// Strong pause: pending frame is cancelled off-screen; resumes on re-entry
// ---------------------------------------------------------------------------

describe('strong pause', () => {
  it('cancels a pending scroll flush when the element leaves, and resumes on re-entry', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    const geo = makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();

    const scroll = createScroll({ target: el, onScroll: cb });
    mockIO.trigger(el, true); // attach + initial measure
    cb.mockClear();

    geo.setLeft(150);
    el.dispatchEvent(new Event('scroll')); // schedules a rAF flush
    mockIO.trigger(el, false); // leaves before the frame runs
    flushRAF();
    expect(cb).not.toHaveBeenCalled(); // the stale frame fires nothing

    mockIO.trigger(el, true); // re-entry re-attaches and re-measures
    expect(cb).toHaveBeenCalledTimes(1);
    cb.mockClear();

    geo.setLeft(240);
    el.dispatchEvent(new Event('scroll'));
    flushRAF();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(scroll.state.x).toBe(240);
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// Vertical axis
// ---------------------------------------------------------------------------

describe('vertical axis', () => {
  it('tracks scrollTop, maxY, progressY and visibleY', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, {
      scrollWidth: 0,
      clientWidth: 0,
      scrollHeight: 500,
      clientHeight: 100,
    });

    const scroll = createScroll({
      target: el,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    expect(scroll.state.maxY).toBe(400);
    expect(scroll.state.visibleY).toBe(0.2); // 100 / 500

    el.scrollTop = 200;
    el.dispatchEvent(new Event('scroll'));
    flushRAF();
    expect(scroll.state.y).toBe(200);
    expect(scroll.state.progressY).toBe(0.5);
    scroll.stop();
  });
});

// ---------------------------------------------------------------------------
// measure() guards
// ---------------------------------------------------------------------------

describe('measure guards', () => {
  it('is a no-op while paused (never forces an off-screen reflow)', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 }); // never visible → paused
    const cb = vi.fn();

    const scroll = createScroll({ target: el, onScroll: cb });
    scroll.measure();
    expect(cb).not.toHaveBeenCalled();
    expect(scroll.state.maxX).toBe(0); // geometry never applied while paused
    scroll.stop();
  });

  it('is a no-op after stop', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const cb = vi.fn();
    const scroll = createScroll({
      target: el,
      onScroll: cb,
      visibility: 'ignore',
    });
    scroll.stop();
    cb.mockClear();
    scroll.measure();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Teardown frees observers and follows the phase sequence
// ---------------------------------------------------------------------------

describe('teardown', () => {
  it('unobserves IO and RO on stop', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const scroll = createScroll({ target: el, onScroll: vi.fn() });
    mockIO.trigger(el, true); // attaches RO too

    expect(mockIO.instances.some((i) => i.observed.has(el))).toBe(true);
    expect(mockRO.instances.some((i) => i.observed.has(el))).toBe(true);

    scroll.stop();
    expect(mockIO.instances.every((i) => !i.observed.has(el))).toBe(true);
    expect(mockRO.instances.every((i) => !i.observed.has(el))).toBe(true);
  });

  it('does not subscribe when the signal is already aborted', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const controller = new AbortController();
    controller.abort();
    const scroll = createScroll({
      target: el,
      onScroll: vi.fn(),
      signal: controller.signal,
    });
    expect(scroll.phase).toBe('stopped');
    expect(mockIO.instances.every((i) => !i.observed.has(el))).toBe(true);
  });

  it('reports the phase sequence via onPhaseChange', async () => {
    const { createScroll } = await getModule();
    const el = document.createElement('div');
    makeScrollable(el, { scrollWidth: 400, clientWidth: 100 });
    const phases: Array<[string, string]> = [];
    const scroll = createScroll({
      target: el,
      onScroll: vi.fn(),
      onPhaseChange: (p, r) => phases.push([p, r]),
    });
    mockIO.trigger(el, true);
    mockIO.trigger(el, false);
    scroll.stop();
    expect(phases).toEqual([
      ['tracking', 'started'],
      ['paused', 'sight'],
      ['stopped', 'disposed'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Page target (document)
// ---------------------------------------------------------------------------

describe('page target', () => {
  /** jsdom leaves documentElement geometry at 0; give it real numbers. */
  function makePageScrollable(geo: Geometry): void {
    makeScrollable(document.documentElement, geo);
  }

  it('measures page geometry from the scrolling element', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({ target: document, onScroll: cb });

    expect(scroll.phase).toBe('tracking');
    expect(scroll.state.maxY).toBe(4000);
    expect(scroll.state.visibleY).toBe(0.2); // 1000 / 5000
    expect(cb).toHaveBeenCalledTimes(1);
    scroll.stop();
  });

  it('tracks immediately without an IntersectionObserver', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 3000, clientHeight: 1000 });

    const scroll = createScroll({ target: document, onScroll: vi.fn() });

    // The page is always in view, so gating it behind IO would never attach.
    expect(mockIO.instances).toHaveLength(0);
    expect(scroll.phase).toBe('tracking');
    scroll.stop();
  });

  it('batches page scroll events into one rAF flush', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({ target: document, onScroll: cb });
    cb.mockClear();

    document.documentElement.scrollTop = 2000;
    document.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));
    expect(cb).not.toHaveBeenCalled();

    flushRAF();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(scroll.state.y).toBe(2000);
    expect(scroll.state.progressY).toBe(0.5);
    scroll.stop();
  });

  it('pauses when the tab is hidden and resumes when visible', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const phases: Array<[string, string]> = [];

    const scroll = createScroll({
      target: document,
      onScroll: vi.fn(),
      onPhaseChange: (phase, reason) => phases.push([phase, reason]),
    });
    expect(scroll.phase).toBe('tracking');

    (document as unknown as { hidden: boolean }).hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scroll.phase).toBe('paused');

    (document as unknown as { hidden: boolean }).hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scroll.phase).toBe('tracking');

    expect(phases).toEqual([
      ['tracking', 'started'],
      ['paused', 'sight'],
      ['tracking', 'started'],
    ]);
    scroll.stop();
  });

  it('re-measures on window resize, which the observer alone would miss', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({ target: document, onScroll: cb });
    expect(scroll.state.maxY).toBe(4000);
    cb.mockClear();

    // Viewport shrinks (mobile URL bar) with content height unchanged, so the
    // content box does not resize and only the resize event can catch it.
    makePageScrollable({ scrollHeight: 5000, clientHeight: 500 });
    window.dispatchEvent(new Event('resize'));
    flushRAF();

    expect(scroll.state.maxY).toBe(4500);
    expect(cb).toHaveBeenCalled();
    scroll.stop();
  });

  it('measures once per resize, not once per notification source', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({ target: document, onScroll: cb });
    cb.mockClear();

    // One real resize notifies both the observer (the scrolling element's box
    // changed) and the window listener. That must cost one layout read.
    mockRO.trigger(document.documentElement, 0, 5000);
    window.dispatchEvent(new Event('resize'));
    flushRAF();

    expect(cb).toHaveBeenCalledTimes(1);
    scroll.stop();
  });

  it('collapses a resize and a scroll in the same frame into one callback', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({ target: document, onScroll: cb });
    cb.mockClear();

    // Redefine geometry first: the helper reinstalls scrollTop, so setting the
    // offset afterwards is what keeps this about coalescing rather than setup.
    makePageScrollable({ scrollHeight: 5000, clientHeight: 500 });
    document.documentElement.scrollTop = 1000;
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    flushRAF();

    expect(cb).toHaveBeenCalledTimes(1);
    // The single callback reflects both the new geometry and the new offset.
    expect(scroll.state.maxY).toBe(4500);
    expect(scroll.state.y).toBe(1000);
    scroll.stop();
  });

  it('detaches page listeners on stop', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({ target: document, onScroll: cb });
    scroll.stop();
    cb.mockClear();

    document.documentElement.scrollTop = 1000;
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    flushRAF();

    expect(cb).not.toHaveBeenCalled();
    expect(scroll.phase).toBe('stopped');
  });

  it('ignores visibility when asked, staying attached while hidden', async () => {
    const { createScroll } = await getModule();
    makePageScrollable({ scrollHeight: 5000, clientHeight: 1000 });
    const cb = vi.fn();

    const scroll = createScroll({
      target: document,
      onScroll: cb,
      visibility: 'ignore',
    });
    cb.mockClear();

    (document as unknown as { hidden: boolean }).hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));

    document.documentElement.scrollTop = 500;
    document.dispatchEvent(new Event('scroll'));
    flushRAF();

    expect(scroll.phase).toBe('tracking');
    expect(cb).toHaveBeenCalledTimes(1);
    scroll.stop();
  });
});

describe('page target construction failure', () => {
  it('releases listeners when the first onScroll throws', async () => {
    const { createScroll } = await getModule();
    makeScrollable(document.documentElement, {
      scrollHeight: 5000,
      clientHeight: 1000,
    });
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    expect(() =>
      createScroll({
        target: document,
        onScroll: () => {
          throw new Error('consumer blew up');
        },
      }),
    ).toThrowError('consumer blew up');

    expect(countCalls(removeSpy, 'scroll')).toBe(countCalls(addSpy, 'scroll'));
    expect(countCalls(removeSpy, 'visibilitychange')).toBe(
      countCalls(addSpy, 'visibilitychange'),
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
