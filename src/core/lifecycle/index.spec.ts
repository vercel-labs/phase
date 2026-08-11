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
      const lifecycle = createLifecycle({ element: el, start: 'manual' });
      expect(lifecycle.phase).toBe('idle');
      expect(lifecycle.phaseReason).toBe('initial');
      lifecycle.stop();
    });

    it('auto-start pauses on sight until visible, then activates', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
      // Not visible yet → paused/sight
      expect(lifecycle.phase).toBe('paused');
      expect(lifecycle.phaseReason).toBe('sight');

      makeVisible(el);
      expect(lifecycle.phase).toBe('active');
      expect(lifecycle.phaseReason).toBe('started');
      lifecycle.stop();
    });

    it('manual start stays idle until start()', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el, start: 'manual' });
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
      const lifecycle = createLifecycle({ element: el });
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
    it('pauses when reduced motion is active (default)', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
      makeVisible(el);
      enableReducedMotion();
      expect(lifecycle.phase).toBe('paused');
      expect(lifecycle.phaseReason).toBe('reduced-motion');
      lifecycle.stop();
    });

    it('reduced motion takes priority over sight', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
      makeVisible(el);
      enableReducedMotion();
      makeHidden(el);
      expect(lifecycle.phaseReason).toBe('reduced-motion');
      lifecycle.stop();
    });

    it('resumes when reduced motion clears (if visible)', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
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
        element: el,
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
      const lifecycle = createLifecycle({ element: el });
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
      const lifecycle = createLifecycle({ element: el });
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
      const lifecycle = createLifecycle({ element: el });
      makeVisible(el);
      lifecycle.stop();
      expect(lifecycle.phase).toBe('stopped');
      expect(lifecycle.phaseReason).toBe('disposed');
    });

    it('signals after stop do not change phase', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
      makeVisible(el);
      lifecycle.stop();
      makeHidden(el);
      makeVisible(el);
      expect(lifecycle.phase).toBe('stopped');
    });

    it('stop is idempotent', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
      lifecycle.stop();
      expect(() => lifecycle.stop()).not.toThrow();
    });

    it('start() after stop is a no-op', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el, start: 'manual' });
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
      const lifecycle = createLifecycle({ element: el, onPhaseChange: cb });

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
        element: el,
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

  describe('raw sight visibility', () => {
    it('visible getter reflects sight independent of phase', async () => {
      const { createLifecycle } = await getModule();
      const el = document.createElement('div');
      const lifecycle = createLifecycle({ element: el });
      expect(lifecycle.visible).toBe(false);

      makeVisible(el);
      expect(lifecycle.visible).toBe(true);

      makeHidden(el);
      expect(lifecycle.visible).toBe(false);
      lifecycle.stop();
    });

    it('onVisibleChange fires even when reduced motion swallows the phase change', async () => {
      const { createLifecycle } = await getModule();
      enableReducedMotion();
      const el = document.createElement('div');
      const onVisibleChange = vi.fn();
      const lifecycle = createLifecycle({ element: el, onVisibleChange });

      // Reduced motion outranks sight: the phase stays paused/reduced-motion...
      makeVisible(el);
      expect(lifecycle.phase).toBe('paused');
      expect(lifecycle.phaseReason).toBe('reduced-motion');
      // ...but the raw visibility signal still reports.
      expect(onVisibleChange).toHaveBeenCalledWith(true);
      expect(lifecycle.visible).toBe(true);

      makeHidden(el);
      expect(onVisibleChange).toHaveBeenCalledWith(false);
      lifecycle.stop();
    });
  });

  describe('SSR', () => {
    it('throws when document is undefined', async () => {
      const origDocument = globalThis.document;
      vi.stubGlobal('document', undefined);
      vi.resetModules();
      const { createLifecycle } = await import('.');
      const el = origDocument.createElement('div');
      expect(() => createLifecycle({ element: el })).toThrow();
      vi.stubGlobal('document', origDocument);
    });
  });
});
