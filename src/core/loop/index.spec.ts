import {
  createMockIntersectionObserver,
  createMockMatchMedia,
} from '../../tests/mocks.js';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getModule() {
  return import('./index.js');
}

function makeSightVisible(el: Element): void {
  mockIO.trigger(el, true);
}

function makeSightHidden(el: Element): void {
  mockIO.trigger(el, false);
}

function enableReducedMotion(): void {
  mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
}

function disableReducedMotion(): void {
  mockMM.setMatches('(prefers-reduced-motion: reduce)', false);
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

describe('phase transitions', () => {
  describe('idle', () => {
    it('initial phase is idle, reason is initial', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        start: 'manual',
      });
      expect(loop.phase).toBe('idle');
      expect(loop.phaseReason).toBe('initial');
      loop.stop();
    });
  });

  describe('idle -> running', () => {
    it('start: auto + sight visible -> running', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      // auto-start calls reconcile immediately, but sight hasn't reported yet,
      // so the loop starts paused(sight). When IO fires visible, it resumes.
      makeSightVisible(el);
      expect(loop.phase).toBe('running');
      loop.stop();
    });

    it('start: manual stays idle until explicit start()', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        start: 'manual',
      });
      makeSightVisible(el);
      expect(loop.phase).toBe('idle');

      loop.start();
      expect(loop.phase).toBe('running');
      loop.stop();
    });
  });

  describe('running -> paused', () => {
    it('sight goes hidden -> paused, reason=sight', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      expect(loop.phase).toBe('running');

      makeSightHidden(el);
      expect(loop.phase).toBe('paused');
      expect(loop.phaseReason).toBe('sight');
      loop.stop();
    });

    it('reduced motion enabled -> paused, reason=reduced-motion', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);

      enableReducedMotion();
      expect(loop.phase).toBe('paused');
      expect(loop.phaseReason).toBe('reduced-motion');
      loop.stop();
    });

    it('reduced motion takes priority over sight', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);

      enableReducedMotion();
      makeSightHidden(el);

      expect(loop.phase).toBe('paused');
      expect(loop.phaseReason).toBe('reduced-motion');
      loop.stop();
    });
  });

  describe('paused -> running', () => {
    it('sight returns to visible -> running, reason=resumed', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      makeSightHidden(el);
      expect(loop.phase).toBe('paused');

      makeSightVisible(el);
      expect(loop.phase).toBe('running');
      expect(loop.phaseReason).toBe('resumed');
      loop.stop();
    });

    it('reduced motion disabled -> resumes if sight visible', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      enableReducedMotion();
      expect(loop.phase).toBe('paused');

      disableReducedMotion();
      expect(loop.phase).toBe('running');
      loop.stop();
    });
  });

  describe('running -> stopped', () => {
    it('stop() -> stopped, reason=disposed', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      loop.stop();
      expect(loop.phase).toBe('stopped');
      expect(loop.phaseReason).toBe('disposed');
    });
  });

  describe('paused -> stopped', () => {
    it('stop() from paused -> stopped, reason=disposed', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      makeSightHidden(el);
      loop.stop();
      expect(loop.phase).toBe('stopped');
      expect(loop.phaseReason).toBe('disposed');
    });
  });

  describe('stopped is terminal', () => {
    it('start() after stop is no-op', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        start: 'manual',
      });
      loop.stop();
      loop.start();
      expect(loop.phase).toBe('stopped');
    });

    it('signals after stop do not change phase', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      loop.stop();

      makeSightHidden(el);
      makeSightVisible(el);
      expect(loop.phase).toBe('stopped');
    });
  });
});

// ---------------------------------------------------------------------------
// Reduced motion modes
// ---------------------------------------------------------------------------

describe('reduced motion modes', () => {
  describe('pause (default)', () => {
    it('pauses when reduced motion matches', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      enableReducedMotion();
      expect(loop.phase).toBe('paused');
      loop.stop();
    });

    it('resumes when preference changes back', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      enableReducedMotion();
      disableReducedMotion();
      expect(loop.phase).toBe('running');
      loop.stop();
    });
  });

  describe('ignore', () => {
    it('runs regardless of reduced motion preference', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      enableReducedMotion();
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        reducedMotion: 'ignore',
      });
      makeSightVisible(el);
      expect(loop.phase).toBe('running');
      loop.stop();
    });
  });
});

// ---------------------------------------------------------------------------
// Quality signal
// ---------------------------------------------------------------------------

describe('quality signal', () => {
  describe('initial', () => {
    it('quality starts as full', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        start: 'manual',
      });
      expect(loop.quality).toBe('full');
      expect(loop.qualityReason).toBeUndefined();
      loop.stop();
    });
  });

  describe('degraded via unfocused', () => {
    it('window blur -> degraded, qualityReason=unfocused', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);

      // Simulate hasFocus returning false
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));

      expect(loop.quality).toBe('degraded');
      expect(loop.qualityReason).toBe('unfocused');
      loop.stop();
    });

    it('window focus -> quality recovers to full', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);

      const hasFocusSpy = vi.spyOn(document, 'hasFocus');
      hasFocusSpy.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
      expect(loop.quality).toBe('degraded');

      hasFocusSpy.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));
      expect(loop.quality).toBe('full');
      loop.stop();
    });
  });

  describe('quality does not affect phase', () => {
    it('quality can be degraded while phase is running', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);

      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));

      expect(loop.phase).toBe('running');
      expect(loop.quality).toBe('degraded');
      loop.stop();
    });
  });
});

// ---------------------------------------------------------------------------
// onPhaseChange callback
// ---------------------------------------------------------------------------

describe('onPhaseChange callback', () => {
  it('fires on each phase transition', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const loop = createLoop({
      element: el,
      onTick: vi.fn(),
      onPhaseChange: cb,
    });

    // Auto-start first pauses (sight not yet visible), then resumes on IO
    makeSightVisible(el);
    expect(cb).toHaveBeenCalledWith('running', 'resumed');

    makeSightHidden(el);
    expect(cb).toHaveBeenCalledWith('paused', 'sight');

    loop.stop();
    expect(cb).toHaveBeenCalledWith('stopped', 'disposed');
  });

  it('is optional', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    expect(() => {
      const loop = createLoop({ element: el, onTick: vi.fn() });
      makeSightVisible(el);
      loop.stop();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Stop cleanup
// ---------------------------------------------------------------------------

describe('stop cleanup', () => {
  it('stop is idempotent', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ element: el, onTick: vi.fn() });
    loop.stop();
    expect(() => loop.stop()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compound signal changes
// ---------------------------------------------------------------------------

describe('compound signal changes', () => {
  it('sight hidden AND reduced motion -> reason is reduced-motion (priority)', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ element: el, onTick: vi.fn() });
    makeSightVisible(el);

    enableReducedMotion();
    makeSightHidden(el);

    expect(loop.phaseReason).toBe('reduced-motion');
    loop.stop();
  });

  it('quality degrades while paused: no crash', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ element: el, onTick: vi.fn() });
    makeSightVisible(el);
    makeSightHidden(el);
    expect(loop.phase).toBe('paused');

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(() => window.dispatchEvent(new Event('blur'))).not.toThrow();
    expect(loop.quality).toBe('degraded');
    loop.stop();
  });
});

// ---------------------------------------------------------------------------
// prefersReducedMotion()
// ---------------------------------------------------------------------------

describe('prefersReducedMotion()', () => {
  it('returns false when matchMedia is undefined (SSR)', async () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.resetModules();
    const { prefersReducedMotion } = await import('./index.js');
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when prefers-reduced-motion matches', async () => {
    enableReducedMotion();
    const { prefersReducedMotion } = await getModule();
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when prefers-reduced-motion does not match', async () => {
    const { prefersReducedMotion } = await getModule();
    expect(prefersReducedMotion()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

describe('SSR', () => {
  it('createLoop throws when requestAnimationFrame is undefined', async () => {
    const origRaf = globalThis.requestAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.resetModules();
    const { createLoop } = await import('./index.js');
    const el = document.createElement('div');
    expect(() => createLoop({ element: el, onTick: vi.fn() })).toThrow();
    vi.stubGlobal('requestAnimationFrame', origRaf);
  });
});
