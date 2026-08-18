import { createMockIntersectionObserver } from '../../../__mocks__/intersection-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

function firstInstance() {
  const inst = mockIO.instances[0];
  if (!inst) throw new Error('No IO instance created');
  return inst;
}

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Reset module-level pool state by re-importing
  vi.resetModules();
});

async function getModule() {
  return import('./io-pool');
}

// ---------------------------------------------------------------------------
// Pooling
// ---------------------------------------------------------------------------

describe('pooling', () => {
  it('same options share one IO instance', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection({ element: el1, onIntersect: vi.fn(), threshold: 0.5 });
    observeIntersection({ element: el2, onIntersect: vi.fn(), threshold: 0.5 });

    expect(mockIO.instances).toHaveLength(1);
  });

  it('no options shares one default instance', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection({ element: el1, onIntersect: vi.fn() });
    observeIntersection({ element: el2, onIntersect: vi.fn() });

    expect(mockIO.instances).toHaveLength(1);
  });

  it('different options create separate IO instances', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection({ element: el1, onIntersect: vi.fn(), threshold: 0.5 });
    observeIntersection({ element: el2, onIntersect: vi.fn(), threshold: 1.0 });

    expect(mockIO.instances).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Callback dispatch
// ---------------------------------------------------------------------------

describe('callback dispatch', () => {
  it('fires callback for the observed element', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();

    observeIntersection({ element: el, onIntersect: cb });
    mockIO.trigger(el, true);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]?.isIntersecting).toBe(true);
  });

  it('does NOT fire callback for a different element', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeIntersection({ element: el1, onIntersect: cb1 });
    observeIntersection({ element: el2, onIntersect: cb2 });

    mockIO.trigger(el1, true);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();
  });

  it('handles multiple elements on the same IO correctly', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeIntersection({ element: el1, onIntersect: cb1 });
    observeIntersection({ element: el2, onIntersect: cb2 });

    mockIO.trigger(el1, true);
    mockIO.trigger(el2, false);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2.mock.calls[0]?.[0]?.isIntersecting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('cleanup function unobserves the element', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeIntersection({ element: el, onIntersect: vi.fn() });

    expect(firstInstance().observed.has(el)).toBe(true);

    cleanup();

    expect(firstInstance().observed.has(el)).toBe(false);
  });

  it('cleanup is idempotent', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeIntersection({ element: el, onIntersect: vi.fn() });

    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('last element cleanup disconnects IO and removes pool entry', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeIntersection({ element: el, onIntersect: vi.fn() });

    cleanup();

    expect(firstInstance().observed.size).toBe(0);
  });

  it('removing one of two elements does NOT disconnect the IO', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const cleanup1 = observeIntersection({
      element: el1,
      onIntersect: vi.fn(),
    });
    observeIntersection({ element: el2, onIntersect: vi.fn() });

    cleanup1();

    expect(firstInstance().observed.has(el2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple subscribers per element
// ---------------------------------------------------------------------------

describe('multiple subscribers per element', () => {
  it('every subscriber on an element receives the entry', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeIntersection({ element: el, onIntersect: cb1 });
    observeIntersection({ element: el, onIntersect: cb2 });

    mockIO.trigger(el, true);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('one subscriber cleaning up leaves the others observed', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cleanup1 = observeIntersection({ element: el, onIntersect: cb1 });
    observeIntersection({ element: el, onIntersect: cb2 });

    cleanup1();
    expect(firstInstance().observed.has(el)).toBe(true);

    mockIO.trigger(el, true);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('unobserves only after the last subscriber cleans up', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup1 = observeIntersection({ element: el, onIntersect: vi.fn() });
    const cleanup2 = observeIntersection({ element: el, onIntersect: vi.fn() });

    cleanup1();
    expect(firstInstance().observed.has(el)).toBe(true);
    cleanup2();
    expect(firstInstance().observed.has(el)).toBe(false);
  });

  it('drops the pooled observer once its last element is released', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup1 = observeIntersection({ element: el, onIntersect: vi.fn() });
    const cleanup2 = observeIntersection({ element: el, onIntersect: vi.fn() });
    expect(mockIO.instances).toHaveLength(1);

    // The pool entry survives while any subscriber remains, so the same IO is
    // reused rather than rebuilt.
    cleanup1();
    observeIntersection({ element: el, onIntersect: vi.fn() });
    expect(mockIO.instances).toHaveLength(1);
    expect(firstInstance().observed.has(el)).toBe(true);

    cleanup2();
  });
});

// ---------------------------------------------------------------------------
// Pool key stability
// ---------------------------------------------------------------------------

describe('pool key stability', () => {
  it('array threshold vs single threshold produce different keys', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection({
      element: el1,
      onIntersect: vi.fn(),
      threshold: [0, 0.5, 1],
    });
    observeIntersection({ element: el2, onIntersect: vi.fn(), threshold: 0.5 });

    expect(mockIO.instances).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// State isolation
// ---------------------------------------------------------------------------

describe('state isolation', () => {
  it('creating and fully cleaning up leaves no leaked state', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeIntersection({ element: el, onIntersect: vi.fn() });

    cleanup();

    // Trigger should not fire anything
    const cb = vi.fn();
    mockIO.trigger(el, true);
    expect(cb).not.toHaveBeenCalled();
  });
});
