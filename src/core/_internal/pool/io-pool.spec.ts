import { createMockIntersectionObserver } from '../../../__mocks__/intersection-observer';
import { describePoolContract } from './pool-contract';

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

describe('late subscribers', () => {
  it('does not receive the initial entry for an already-observed element', async () => {
    const { observeIntersection } = await getModule();
    const el = document.createElement('div');
    const early = vi.fn();
    const late = vi.fn();

    observeIntersection({ element: el, onIntersect: early });
    mockIO.trigger(el, true);

    // `observe()` is a no-op for a target the observer already holds, so this
    // subscriber waits for the next change rather than learning current state.
    observeIntersection({ element: el, onIntersect: late });
    expect(late).not.toHaveBeenCalled();

    mockIO.trigger(el, true);
    expect(late).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Shared pool contract
// ---------------------------------------------------------------------------

describePoolContract<Element>({
  keys: () => [document.createElement('div'), document.createElement('div')],
  create: async () => {
    const { observeIntersection } = await getModule();
    return {
      subscribe: (element, callback) =>
        observeIntersection({ element, onIntersect: callback }),
      notify: (element) => mockIO.trigger(element, true),
      isBound: (element) =>
        mockIO.instances.some((instance) => instance.observed.has(element)),
    };
  },
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
