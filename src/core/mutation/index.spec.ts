import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMutationObserver } from '../../__mocks__/mutation-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMO: ReturnType<typeof createMockMutationObserver>;
let rafCallbacks: Array<FrameRequestCallback>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockMO = createMockMutationObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('MutationObserver', mockMO.MockClass);
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
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    expect(mutation.phase).toBe('paused');
    expect(mutation.phaseReason).toBe('initial');
    mutation.stop();
  });

  it('phase starts as observing when visibility is ignore', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      visibility: 'ignore',
    });
    expect(mutation.phase).toBe('observing');
    expect(mutation.phaseReason).toBe('started');
    mutation.stop();
  });
});

// ---------------------------------------------------------------------------
// rAF batching
// ---------------------------------------------------------------------------

describe('rAF batching', () => {
  it('coalesces multiple MO callbacks into one rAF flush', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: cb,
      visibility: 'ignore',
    });

    mockMO.trigger(el, [{ type: 'childList' }]);
    mockMO.trigger(el, [{ type: 'childList' }]);

    expect(cb).not.toHaveBeenCalled();
    flushRAF();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]).toHaveLength(2);
    mutation.stop();
  });

  it('does not flush if stopped before rAF fires', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: cb,
      visibility: 'ignore',
    });

    mockMO.trigger(el, [{ type: 'childList' }]);
    mutation.stop();
    flushRAF();

    expect(cb).not.toHaveBeenCalled();
  });

  it('does not flush when paused', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: cb,
    });

    mockMO.trigger(el, [{ type: 'childList' }]);
    flushRAF();

    expect(cb).not.toHaveBeenCalled();
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
      target: el,
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
      target: el,
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
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    setDocumentHidden(true);
    expect(mutation.phase).toBe('paused');
    expect(mutation.phaseReason).toBe('sight');
    mutation.stop();
  });

  it('resumes when document is foregrounded', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    setDocumentHidden(true);
    setDocumentHidden(false);
    expect(mutation.phase).toBe('observing');
    mutation.stop();
  });

  it('drops pending records when paused', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: cb,
    });

    mockIO.trigger(el, true);
    mockMO.trigger(el, [{ type: 'childList' }]);

    mockIO.trigger(el, false);
    flushRAF();

    expect(cb).not.toHaveBeenCalled();
    mutation.stop();
  });

  it('delivers records accumulated while visible', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: cb,
    });

    mockIO.trigger(el, true);
    mockMO.trigger(el, [{ type: 'childList' }]);
    flushRAF();

    expect(cb).toHaveBeenCalledTimes(1);
    mutation.stop();
  });

  it('handles rapid visibility toggles without error', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    mockIO.trigger(el, false);
    mockIO.trigger(el, true);
    mockIO.trigger(el, false);
    mockIO.trigger(el, true);

    expect(mutation.phase).toBe('observing');
    mutation.stop();
  });
});

// ---------------------------------------------------------------------------
// onPhaseChange callback
// ---------------------------------------------------------------------------

describe('onPhaseChange callback', () => {
  it('fires on visibility transitions', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      onPhaseChange: cb,
    });

    mockIO.trigger(el, true);
    expect(cb).toHaveBeenCalledWith('observing', 'started');

    mockIO.trigger(el, false);
    expect(cb).toHaveBeenCalledWith('paused', 'sight');

    mutation.stop();
    expect(cb).toHaveBeenCalledWith('stopped', 'disposed');
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('fires on document background', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      onPhaseChange: cb,
    });

    mockIO.trigger(el, true);
    setDocumentHidden(true);
    expect(cb).toHaveBeenCalledWith('paused', 'sight');
    mutation.stop();
  });

  it('does not fire when phase stays the same', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      onPhaseChange: cb,
    });

    mockIO.trigger(el, true);
    expect(cb).toHaveBeenCalledTimes(1);

    mockIO.trigger(el, true);
    expect(cb).toHaveBeenCalledTimes(1);
    mutation.stop();
  });

  it('is optional', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    expect(() => mockIO.trigger(el, true)).not.toThrow();
    mutation.stop();
  });

  it('fires on start with visibility ignore', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      onPhaseChange: cb,
      visibility: 'ignore',
    });
    expect(cb).toHaveBeenCalledWith('observing', 'started');
    mutation.stop();
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
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });

    mockIO.trigger(el, true);
    mutation.stop();
    expect(mutation.phase).toBe('stopped');
    expect(mutation.phaseReason).toBe('disposed');
  });

  it('stop is idempotent', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      target: el,
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
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      signal: controller.signal,
    });

    controller.abort();
    expect(mutation.phase).toBe('stopped');
  });

  it('already-aborted signal prevents observation', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const controller = new AbortController();
    controller.abort();

    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: vi.fn(),
      signal: controller.signal,
    });

    expect(mutation.phase).toBe('stopped');
  });

  it('no callbacks fire after stop even if rAF was scheduled', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const mutation = createMutation({
      target: el,
      mutation: { childList: true },
      onMutations: cb,
      visibility: 'ignore',
    });

    mockMO.trigger(el, [{ type: 'childList' }]);
    mutation.stop();
    flushRAF();

    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error guards
// ---------------------------------------------------------------------------

describe('error guards', () => {
  it('throws no_target when target is null', async () => {
    const { createMutation } = await getModule();
    expect(() =>
      createMutation({
        // @ts-expect-error — testing the runtime guard
        target: null,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    ).toThrowError(/target/);
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
      target: el,
      mutation: { subtree: true, attributes: true, attributeFilter: ['style'] },
      onMutations: vi.fn(),
      visibility: 'ignore',
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
      target: el,
      mutation: {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      },
      onMutations: vi.fn(),
      visibility: 'ignore',
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
      target: el,
      mutation: { attributes: true, attributeFilter: ['style'] },
      onMutations: vi.fn(),
      visibility: 'ignore',
    });
    expect(warnSpy).not.toHaveBeenCalled();
    mutation.stop();
  });

  it('does not warn for safe attributeFilter', async () => {
    const { createMutation } = await getModule();
    const el = document.createElement('div');
    const mutation = createMutation({
      target: el,
      mutation: {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-theme'],
      },
      onMutations: vi.fn(),
      visibility: 'ignore',
    });
    expect(warnSpy).not.toHaveBeenCalled();
    mutation.stop();
  });
});
