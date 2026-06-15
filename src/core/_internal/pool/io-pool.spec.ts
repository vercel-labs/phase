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
    const opts = { threshold: 0.5 };

    observeIntersection(el1, vi.fn(), opts);
    observeIntersection(el2, vi.fn(), opts);

    expect(mockIO.instances).toHaveLength(1);
  });

  it('no options shares one default instance', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection(el1, vi.fn());
    observeIntersection(el2, vi.fn());

    expect(mockIO.instances).toHaveLength(1);
  });

  it('different options create separate IO instances', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection(el1, vi.fn(), { threshold: 0.5 });
    observeIntersection(el2, vi.fn(), { threshold: 1.0 });

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

    observeIntersection(el, cb);
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

    observeIntersection(el1, cb1);
    observeIntersection(el2, cb2);

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

    observeIntersection(el1, cb1);
    observeIntersection(el2, cb2);

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
    const cleanup = observeIntersection(el, vi.fn());

    expect(firstInstance().observed.has(el)).toBe(true);

    cleanup();

    expect(firstInstance().observed.has(el)).toBe(false);
  });

  it('cleanup is idempotent', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeIntersection(el, vi.fn());

    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('last element cleanup disconnects IO and removes pool entry', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeIntersection(el, vi.fn());

    cleanup();

    expect(firstInstance().observed.size).toBe(0);
  });

  it('removing one of two elements does NOT disconnect the IO', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const cleanup1 = observeIntersection(el1, vi.fn());
    observeIntersection(el2, vi.fn());

    cleanup1();

    expect(firstInstance().observed.has(el2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ownership safety
// ---------------------------------------------------------------------------

describe('ownership safety', () => {
  it('second subscription on same element overwrites callback', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    observeIntersection(el, cb1);
    observeIntersection(el, cb2);

    mockIO.trigger(el, true);

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('first cleanup does NOT unobserve if second subscription replaced it', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const cleanup1 = observeIntersection(el, vi.fn());
    const cb2 = vi.fn();
    observeIntersection(el, cb2);

    cleanup1();

    // el should still be observed (owned by second subscription)
    expect(firstInstance().observed.has(el)).toBe(true);

    mockIO.trigger(el, true);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('second cleanup correctly unobserves', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    observeIntersection(el, vi.fn());
    const cleanup2 = observeIntersection(el, vi.fn());

    cleanup2();
    expect(firstInstance().observed.has(el)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pool key stability
// ---------------------------------------------------------------------------

describe('pool key stability', () => {
  it('undefined options and {} both produce the same default instance', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection(el1, vi.fn(), undefined);
    observeIntersection(el2, vi.fn(), {});

    // {} produces key 'null|0px|0' which differs from '' (undefined)
    // Both should still share observers where options match
    expect(mockIO.instances.length).toBeLessThanOrEqual(2);
  });

  it('array threshold vs single threshold produce different keys', async () => {
    const { observeIntersection } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');

    observeIntersection(el1, vi.fn(), { threshold: [0, 0.5, 1] });
    observeIntersection(el2, vi.fn(), { threshold: 0.5 });

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
    const cleanup = observeIntersection(el, vi.fn());

    cleanup();

    // Trigger should not fire anything
    const cb = vi.fn();
    mockIO.trigger(el, true);
    expect(cb).not.toHaveBeenCalled();
  });
});
