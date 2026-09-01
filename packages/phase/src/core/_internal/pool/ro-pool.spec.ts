// Native observer delivery coverage lives in ro-pool.browser.spec.ts. Keep only
// deterministic pooling policy and teardown scenarios here.
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
    expect(cb).toHaveBeenCalledWith(expect.anything(), 'native');
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

  it('replays the latest entry asynchronously to a late subscriber', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    observeResize(el, vi.fn());
    mockRO.trigger(el, 200, 100);
    const late = vi.fn();

    observeResize(el, late);

    expect(late).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith(expect.anything(), 'replay');
    expect(late.mock.calls[0]?.[0]?.contentBoxSize[0].inlineSize).toBe(200);
  });

  it('cancels a pending replay when the subscriber releases', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    observeResize(el, vi.fn());
    mockRO.trigger(el, 200, 100);
    const late = vi.fn();

    const release = observeResize(el, late);
    release();
    await Promise.resolve();

    expect(late).not.toHaveBeenCalled();
  });

  it('does not replay after a newer native entry', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    observeResize(el, vi.fn());
    mockRO.trigger(el, 200, 100);
    const late = vi.fn();

    observeResize(el, late);
    mockRO.trigger(el, 220, 100);
    await Promise.resolve();

    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0]?.[0]?.contentBoxSize[0].inlineSize).toBe(220);
  });

  it('does not duplicate a reentrant subscriber during native fan-out', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const late = vi.fn();
    observeResize(el, () => observeResize(el, late));

    mockRO.trigger(el, 200, 100);
    expect(late).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(late).toHaveBeenCalledTimes(1);
  });

  it('does not consume recursive registrations in the current fan-out', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    let registrations = 0;
    const recursive = vi.fn(() => {
      if (registrations++ < 3) observeResize(el, recursive);
    });
    observeResize(el, recursive);

    mockRO.trigger(el, 200, 100);
    await Promise.resolve();

    expect(recursive).toHaveBeenCalledTimes(1);
  });

  it('replays a reentrant subscriber after an earlier callback throws', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const late = vi.fn();
    const error = new Error('subscriber failed');
    observeResize(el, () => {
      observeResize(el, late);
      throw error;
    });

    expect(() => mockRO.trigger(el, 200, 100)).toThrow(error);
    expect(late).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(late).toHaveBeenCalledTimes(1);
  });

  it('delivers a subscriber joined before its later batch entry natively', async () => {
    const { observeResize } = await getModule();
    const first = document.createElement('div');
    const second = document.createElement('div');
    const late = vi.fn();
    observeResize(first, () => observeResize(second, late));
    observeResize(second, vi.fn());

    mockRO.triggerBatch([
      { element: first, width: 100, height: 50 },
      { element: second, width: 200, height: 100 },
    ]);
    await Promise.resolve();

    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith(expect.anything(), 'native');
  });

  it('replays a subscriber joined after its earlier batch entry', async () => {
    const { observeResize } = await getModule();
    const first = document.createElement('div');
    const second = document.createElement('div');
    const late = vi.fn();
    observeResize(first, () => observeResize(second, late));
    observeResize(second, vi.fn());

    mockRO.triggerBatch([
      { element: second, width: 200, height: 100 },
      { element: first, width: 100, height: 50 },
    ]);
    expect(late).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith(expect.anything(), 'replay');
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

  it('drops the latest entry when the final subscriber releases', async () => {
    const { observeResize } = await getModule();
    const el = document.createElement('div');
    const release = observeResize(el, vi.fn());
    mockRO.trigger(el, 200, 100);
    release();
    const later = vi.fn();

    observeResize(el, later);
    await Promise.resolve();

    expect(later).not.toHaveBeenCalled();
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
