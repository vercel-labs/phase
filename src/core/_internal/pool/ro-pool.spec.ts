import { createMockResizeObserver } from '../../../__mocks__/resize-observer';
import { describePoolContract } from './pool-contract';

let mockRO: ReturnType<typeof createMockResizeObserver>;

function firstInstance() {
  const inst = mockRO.instances[0];
  if (!inst) throw new Error('No RO instance created');
  return inst;
}

beforeEach(() => {
  mockRO = createMockResizeObserver();
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getModule() {
  return import('./ro-pool');
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('singleton', () => {
  it('first observeResize creates the RO', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    observeResize(el, vi.fn());
    expect(mockRO.instances).toHaveLength(1);
  });

  it('second observeResize reuses the same RO', async () => {
    const { observeResize } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    observeResize(el1, vi.fn());
    observeResize(el2, vi.fn());
    expect(mockRO.instances).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Callback dispatch
// ---------------------------------------------------------------------------

describe('callback dispatch', () => {
  it('fires callback for the correct element', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    observeResize(el, cb);
    mockRO.trigger(el, 200, 100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]?.contentBoxSize[0].inlineSize).toBe(200);
  });

  it('two elements get independent callbacks', async () => {
    const { observeResize } = await getModule();
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    observeResize(el1, cb1);
    observeResize(el2, cb2);

    mockRO.trigger(el1, 100, 50);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();

    mockRO.trigger(el2, 300, 150);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('cleanup unobserves the element', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeResize(el, vi.fn());
    expect(firstInstance().observed.has(el)).toBe(true);
    cleanup();
    expect(firstInstance().observed.has(el)).toBe(false);
  });

  it('cleanup is idempotent', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeResize(el, vi.fn());
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('RO persists after all elements removed (singleton)', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const cleanup = observeResize(el, vi.fn());
    cleanup();

    // RO instance still exists — singleton is not destroyed
    expect(mockRO.instances).toHaveLength(1);

    // Can still observe new elements
    const el2 = document.createElement('div');
    observeResize(el2, vi.fn());
    expect(mockRO.instances).toHaveLength(1);
    expect(firstInstance().observed.has(el2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shared pool contract
// ---------------------------------------------------------------------------

describePoolContract<Element>({
  keys: () => [document.createElement('div'), document.createElement('div')],
  create: async () => {
    const { observeResize } = await getModule();
    return {
      subscribe: (element, callback) => observeResize(element, callback),
      notify: (element) => mockRO.trigger(element, 100, 50),
      isBound: (element) =>
        mockRO.instances.some((instance) => instance.observed.has(element)),
    };
  },
});
