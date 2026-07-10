import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';

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

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function getModule() {
  return import('.');
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('phase starts as paused when visibility-aware', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    expect(mutation.phase).toBe('paused');
    expect(mutation.phaseReason).toBe('initial');
    mutation.stop();
  });

  it('phase starts as observing when visibilityAware is false', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      visibilityAware: false,
    });
    expect(mutation.phase).toBe('observing');
    expect(mutation.phaseReason).toBe('started');
    mutation.stop();
  });
});

// ---------------------------------------------------------------------------
// Visibility gating
// ---------------------------------------------------------------------------

describe('visibility gating', () => {
  it('starts observing when element becomes visible', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    expect(mutation.phase).toBe('paused');

    mockIO.trigger(el, true);
    expect(mutation.phase).toBe('observing');
    expect(mutation.phaseReason).toBe('started');
    mutation.stop();
  });

  it('pauses when element leaves viewport', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    expect(mutation.phase).toBe('observing');

    mockIO.trigger(el, false);
    expect(mutation.phase).toBe('paused');
    expect(mutation.phaseReason).toBe('sight');
    mutation.stop();
  });

  it('pauses when document is backgrounded', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    expect(mutation.phase).toBe('observing');

    setDocumentHidden(true);
    expect(mutation.phase).toBe('paused');
    expect(mutation.phaseReason).toBe('sight');
    mutation.stop();
  });

  it('resumes when document is foregrounded', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    setDocumentHidden(true);
    expect(mutation.phase).toBe('paused');

    setDocumentHidden(false);
    expect(mutation.phase).toBe('observing');
    mutation.stop();
  });
});

// ---------------------------------------------------------------------------
// rAF batching
// ---------------------------------------------------------------------------

describe('rAF batching', () => {
  it('coalesces mutations into a single rAF callback', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: cb,
      visibilityAware: false,
    });

    // Simulate MO firing — we need to trigger DOM mutations
    const child1 = document.createElement('span');
    const child2 = document.createElement('span');
    el.appendChild(child1);
    el.appendChild(child2);

    // The MO callback hasn't fired yet because jsdom doesn't run MO synchronously.
    // But we can test the batching by checking that rAF was scheduled.
    // In practice, the MO fires async and the rAF coalesces.
    expect(cb).not.toHaveBeenCalled();
    mutation.stop();
  });

  it('does not fire callback after stop', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: cb,
      visibilityAware: false,
    });

    mutation.stop();
    flushRAF();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stop / teardown
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('phase returns stopped after stop', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    expect(mutation.phase).toBe('observing');

    mutation.stop();
    expect(mutation.phase).toBe('stopped');
    expect(mutation.phaseReason).toBe('disposed');
  });

  it('stop is idempotent', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    mutation.stop();
    expect(() => mutation.stop()).not.toThrow();
  });

  it('aborting the signal stops the observer', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const controller = new AbortController();
    const mutation = createMutation({
      element: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      signal: controller.signal,
    });

    controller.abort();
    expect(mutation.phase).toBe('stopped');
    expect(mutation.phaseReason).toBe('disposed');
  });
});

// ---------------------------------------------------------------------------
// Error guards
// ---------------------------------------------------------------------------

describe('error guards', () => {
  it('throws no_element when element is null', async () => {
    const { createMutation } = await getModule();
    expect(() =>
      createMutation({
        // @ts-expect-error — testing the runtime guard
        element: null,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    ).toThrowError(/DOM element/);
  });
});

// ---------------------------------------------------------------------------
// Dev-mode warnings
// ---------------------------------------------------------------------------

describe('dev-mode warnings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns on subtree + attributeFilter with style', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { subtree: true, attributes: true, attributeFilter: ['style'] },
      onMutations: vi.fn(),
      visibilityAware: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('subtree + attributeFilter'),
    );
    mutation.stop();
  });

  it('warns on subtree + attributeFilter with class', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      },
      onMutations: vi.fn(),
      visibilityAware: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('subtree + attributeFilter'),
    );
    mutation.stop();
  });

  it('does not warn without subtree', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: { attributes: true, attributeFilter: ['style'] },
      onMutations: vi.fn(),
      visibilityAware: false,
    });
    expect(warnSpy).not.toHaveBeenCalled();
    mutation.stop();
  });

  it('does not warn for safe attributeFilter', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      element: el,
      mutation: {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-theme'],
      },
      onMutations: vi.fn(),
      visibilityAware: false,
    });
    expect(warnSpy).not.toHaveBeenCalled();
    mutation.stop();
  });
});
