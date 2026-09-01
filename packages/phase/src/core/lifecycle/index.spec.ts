// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic policy and headless-unreachable scenarios here.
import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getModule() {
  return import('.');
}

function makeVisible(el: Element): void {
  mockIO.trigger(el, true);
}

function makeHidden(el: Element): void {
  mockIO.trigger(el, false);
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function enableReducedMotion(): void {
  mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
}

function disableReducedMotion(): void {
  mockMM.setMatches('(prefers-reduced-motion: reduce)', false);
}

describe('createLifecycle', () => {
  describe('phase transitions', () => {
    it('initial phase is idle/initial with start: manual', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el, start: 'manual' });
      expect(lifecycle.phase).toBe('idle');
      expect(lifecycle.phaseReason).toBe('initial');
      lifecycle.stop();
    });

    it('manual start stays idle until start()', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el, start: 'manual' });
      makeVisible(el);
      expect(lifecycle.phase).toBe('idle');

      lifecycle.start();
      expect(lifecycle.phase).toBe('active');
      expect(lifecycle.phaseReason).toBe('started');
      lifecycle.stop();
    });

    it('second activation reports resumed, not started', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      expect(lifecycle.phaseReason).toBe('started');

      makeHidden(el);
      makeVisible(el);
      expect(lifecycle.phase).toBe('active');
      expect(lifecycle.phaseReason).toBe('resumed');
      lifecycle.stop();
    });
  });

  describe('reduced motion', () => {
    it('reduced motion takes priority over sight', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      enableReducedMotion();
      makeHidden(el);
      expect(lifecycle.phaseReason).toBe('reduced-motion');
      lifecycle.stop();
    });

    it('resumes when reduced motion clears (if visible)', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      enableReducedMotion();
      disableReducedMotion();
      expect(lifecycle.phase).toBe('active');
      lifecycle.stop();
    });

    it('ignore mode does not pause on reduced motion', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      enableReducedMotion();
      const lifecycle = createLifecycle({
        target: el,
        reducedMotion: 'ignore',
      });
      makeVisible(el);
      expect(lifecycle.phase).toBe('active');
      lifecycle.stop();
    });
  });

  describe('manual pause', () => {
    it('pause() pauses with reason manual, resume() restores', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      expect(lifecycle.phase).toBe('active');

      lifecycle.pause();
      expect(lifecycle.phase).toBe('paused');
      expect(lifecycle.phaseReason).toBe('manual');

      lifecycle.resume();
      expect(lifecycle.phase).toBe('active');
      lifecycle.stop();
    });

    it('sight and reduced-motion take priority over manual pause', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      lifecycle.pause();
      expect(lifecycle.phaseReason).toBe('manual');

      makeHidden(el);
      expect(lifecycle.phaseReason).toBe('sight');

      makeVisible(el);
      // Still manually paused
      expect(lifecycle.phase).toBe('paused');
      expect(lifecycle.phaseReason).toBe('manual');
      lifecycle.stop();
    });
  });

  describe('lifecycle teardown', () => {
    it('stop() transitions to stopped/disposed', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      lifecycle.stop();
      expect(lifecycle.phase).toBe('stopped');
      expect(lifecycle.phaseReason).toBe('disposed');
    });

    it('signals after stop do not change phase', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      makeVisible(el);
      lifecycle.stop();
      makeHidden(el);
      makeVisible(el);
      expect(lifecycle.phase).toBe('stopped');
    });

    it('stop is idempotent', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el });
      lifecycle.stop();
      expect(() => lifecycle.stop()).not.toThrow();
    });

    it('start() after stop is a no-op', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ target: el, start: 'manual' });
      lifecycle.stop();
      lifecycle.start();
      expect(lifecycle.phase).toBe('stopped');
    });
  });

  describe('onPhaseChange callback', () => {
    it('fires on each transition and is optional', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const cb = vi.fn();
      const lifecycle = createLifecycle({ target: el, onPhaseChange: cb });

      makeVisible(el);
      expect(cb).toHaveBeenCalledWith('active', 'started');

      makeHidden(el);
      expect(cb).toHaveBeenCalledWith('paused', 'sight');

      lifecycle.stop();
      expect(cb).toHaveBeenCalledWith('stopped', 'disposed');
    });
  });

  describe('abort signal', () => {
    it('aborting the signal stops the lifecycle', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const cb = vi.fn();
      const controller = new AbortController();
      const lifecycle = createLifecycle({
        target: el,
        onPhaseChange: cb,
        signal: controller.signal,
      });
      makeVisible(el);
      expect(lifecycle.phase).toBe('active');

      controller.abort();
      expect(lifecycle.phase).toBe('stopped');
      expect(cb).toHaveBeenCalledWith('stopped', 'disposed');

      cb.mockClear();
      makeHidden(el);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('SSR', () => {
    it('throws when document is undefined', async () => {
      const origDocument = globalThis.document;
      vi.stubGlobal('document', undefined);
      vi.resetModules();
      const { createLifecycle } = await import('.');
      const el = origDocument.createElement('div');
      expect(() => createLifecycle({ target: el })).toThrow();
      vi.stubGlobal('document', origDocument);
    });
  });
});

// ---------------------------------------------------------------------------
// Page anchor (document)
// ---------------------------------------------------------------------------

describe('page anchor', () => {
  it('activates on the page with no observer', async () => {
    const { createLifecycle } = await getModule();
    const onPhaseChange = vi.fn();

    const lifecycle = createLifecycle({ target: document, onPhaseChange });

    expect(mockIO.instances).toHaveLength(0);
    expect(lifecycle.phase).toBe('active');
    expect(onPhaseChange).toHaveBeenCalledWith('active', 'started');
    lifecycle.stop();
  });

  it('pauses on tab hide and resumes on show', async () => {
    const { createLifecycle } = await getModule();
    const lifecycle = createLifecycle({ target: document });
    expect(lifecycle.phase).toBe('active');

    setDocumentHidden(true);
    expect(lifecycle.phase).toBe('paused');
    expect(lifecycle.phaseReason).toBe('sight');

    setDocumentHidden(false);
    expect(lifecycle.phase).toBe('active');
    lifecycle.stop();
  });

  it('still honors reduced motion on a page anchor', async () => {
    const { createLifecycle } = await getModule();
    enableReducedMotion();

    const lifecycle = createLifecycle({ target: document });

    expect(lifecycle.phase).toBe('paused');
    expect(lifecycle.phaseReason).toBe('reduced-motion');
    lifecycle.stop();
  });
});
