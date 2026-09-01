// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic policy and headless-unreachable scenarios here.
import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getModule() {
  return import('.');
}

// ---------------------------------------------------------------------------
// Ratio updates
// ---------------------------------------------------------------------------

describe('ratio updates', () => {
  it('onProgress does NOT fire when ratio is unchanged', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const progress = createScrollProgress({ target: el, onProgress: cb });

    mockIO.triggerWithRatio(el, 0.5);
    mockIO.triggerWithRatio(el, 0.5);

    expect(cb).toHaveBeenCalledTimes(1);
    progress.stop();
  });

  it('tracks multiple ratio changes', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const ratios: number[] = [];
    const progress = createScrollProgress({
      target: el,
      onProgress: (r) => ratios.push(r),
    });

    mockIO.triggerWithRatio(el, 0.25);
    mockIO.triggerWithRatio(el, 0.5);
    mockIO.triggerWithRatio(el, 1.0);

    expect(ratios).toEqual([0.25, 0.5, 1.0]);
    progress.stop();
  });
});

// ---------------------------------------------------------------------------
// Synchronous ratio read
// ---------------------------------------------------------------------------

describe('synchronous ratio read', () => {
  it('ratio returns 0 before first observation', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const progress = createScrollProgress({ target: el, onProgress: vi.fn() });

    expect(progress.ratio).toBe(0);
    progress.stop();
  });

  it('ratio returns last-reported value', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const progress = createScrollProgress({ target: el, onProgress: vi.fn() });

    mockIO.triggerWithRatio(el, 0.75);
    expect(progress.ratio).toBe(0.75);
    progress.stop();
  });
});

// ---------------------------------------------------------------------------
// Stop
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('stop is idempotent', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const progress = createScrollProgress({ target: el, onProgress: vi.fn() });

    progress.stop();
    expect(() => progress.stop()).not.toThrow();
  });

  it('no callbacks fire after stop', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const progress = createScrollProgress({ target: el, onProgress: cb });

    mockIO.triggerWithRatio(el, 0.5);
    cb.mockClear();

    progress.stop();
    mockIO.triggerWithRatio(el, 1.0);

    expect(cb).not.toHaveBeenCalled();
  });

  it('aborting the signal stops the observer', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const controller = new AbortController();
    createScrollProgress({
      target: el,
      onProgress: cb,
      signal: controller.signal,
    });

    controller.abort();
    mockIO.triggerWithRatio(el, 0.5);

    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pool deduplication
// ---------------------------------------------------------------------------

describe('pool deduplication', () => {
  it('same steps share one IO instance', async () => {
    const { createScrollProgress } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    const p1 = createScrollProgress({ target: el1, onProgress: vi.fn() });
    const p2 = createScrollProgress({ target: el2, onProgress: vi.fn() });

    expect(mockIO.instances).toHaveLength(1);
    p1.stop();
    p2.stop();
  });

  it('different steps create separate IO instances', async () => {
    const { createScrollProgress } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    const p1 = createScrollProgress({
      target: el1,
      onProgress: vi.fn(),
      steps: 10,
    });
    const p2 = createScrollProgress({
      target: el2,
      onProgress: vi.fn(),
      steps: 50,
    });

    expect(mockIO.instances).toHaveLength(2);
    p1.stop();
    p2.stop();
  });
});

// ---------------------------------------------------------------------------
// Threshold generation
// ---------------------------------------------------------------------------

describe('threshold generation', () => {
  it('default steps creates IO with 21 thresholds', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const progress = createScrollProgress({ target: el, onProgress: vi.fn() });

    const inst = mockIO.instances[0];
    expect(inst?.options?.threshold).toHaveLength(21);
    progress.stop();
  });

  it('custom steps creates correct threshold count', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const progress = createScrollProgress({
      target: el,
      onProgress: vi.fn(),
      steps: 10,
    });

    const inst = mockIO.instances[0];
    expect(inst?.options?.threshold).toHaveLength(11);
    progress.stop();
  });
});

// ---------------------------------------------------------------------------
// Options passthrough
// ---------------------------------------------------------------------------

describe('options passthrough', () => {
  it('rootMargin passes through to the IO pool', async () => {
    const { createScrollProgress } = await getModule();
    const el = document.createElement('div');
    const progress = createScrollProgress({
      target: el,
      onProgress: vi.fn(),
      rootMargin: '100px',
    });

    const inst = mockIO.instances[0];
    expect(inst?.options?.rootMargin).toBe('100px');
    progress.stop();
  });
});

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

describe('SSR', () => {
  it('throws when IntersectionObserver is undefined', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.resetModules();
    const { createScrollProgress } = await import('.');
    expect(() =>
      createScrollProgress({
        target: document.createElement('div'),
        onProgress: vi.fn(),
      }),
    ).toThrow();
  });
});
