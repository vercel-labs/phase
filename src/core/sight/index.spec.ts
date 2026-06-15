import { createMockIntersectionObserver } from '../../tests/mocks';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
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

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function firePageShow(persisted: boolean): void {
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
}

async function getModule() {
  return import('.');
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('phase starts as unknown', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });
    expect(sight.phase).toBe('unknown');
    sight.dispose();
  });

  it('reason starts as initial', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });
    expect(sight.phaseReason).toBe('initial');
    sight.dispose();
  });
});

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

describe('phase transitions', () => {
  describe('unknown -> visible', () => {
    it('IO intersecting + doc visible -> visible', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      expect(sight.phase).toBe('visible');
      sight.dispose();
    });
  });

  describe('unknown -> hidden', () => {
    it('IO not intersecting -> hidden, reason=viewport', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const cb = vi.fn();
      const sight = createSight({ element: el, onPhaseChange: cb });

      mockIO.trigger(el, false);
      expect(sight.phase).toBe('hidden');
      expect(sight.phaseReason).toBe('viewport');
      sight.dispose();
    });
  });

  describe('visible -> hidden', () => {
    it('document backgrounded -> hidden, reason=document', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      expect(sight.phase).toBe('visible');

      setDocumentHidden(true);
      expect(sight.phase).toBe('hidden');
      expect(sight.phaseReason).toBe('document');
      sight.dispose();
    });

    it('element scrolled out -> hidden, reason=viewport', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      mockIO.trigger(el, false);

      expect(sight.phase).toBe('hidden');
      expect(sight.phaseReason).toBe('viewport');
      sight.dispose();
    });

    it('both hidden simultaneously -> hidden, reason=both', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      expect(sight.phase).toBe('visible');

      // Hide both: element leaves AND tab backgrounds
      mockIO.trigger(el, false);
      setDocumentHidden(true);

      expect(sight.phase).toBe('hidden');
      expect(sight.phaseReason).toBe('both');
      sight.dispose();
    });
  });

  describe('hidden -> visible', () => {
    it('element scrolls back + doc visible -> visible', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      mockIO.trigger(el, false);
      expect(sight.phase).toBe('hidden');

      mockIO.trigger(el, true);
      expect(sight.phase).toBe('visible');
      sight.dispose();
    });

    it('tab foregrounded + element in view -> visible', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      setDocumentHidden(true);
      expect(sight.phase).toBe('hidden');

      setDocumentHidden(false);
      expect(sight.phase).toBe('visible');
      sight.dispose();
    });
  });

  describe('hidden -> visible via bfcache', () => {
    it('pageshow with persisted=true -> visible, reason=bfcache', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      setDocumentHidden(true);
      expect(sight.phase).toBe('hidden');

      firePageShow(true);
      expect(sight.phase).toBe('visible');
      expect(sight.phaseReason).toBe('bfcache');
      sight.dispose();
    });

    it('pageshow with persisted=false -> no change', async () => {
      const { createSight } = await getModule();
      const el = document.createElement('div');
      const sight = createSight({ element: el });

      mockIO.trigger(el, true);
      setDocumentHidden(true);

      firePageShow(false);
      expect(sight.phase).toBe('hidden');
      sight.dispose();
    });
  });
});

// ---------------------------------------------------------------------------
// Reason tracking
// ---------------------------------------------------------------------------

describe('reason tracking', () => {
  it('first visible transition defaults to reason=viewport', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });

    mockIO.trigger(el, true);
    expect(sight.phaseReason).toBe('viewport');
    sight.dispose();
  });
});

// ---------------------------------------------------------------------------
// onPhaseChange callback
// ---------------------------------------------------------------------------

describe('onPhaseChange callback', () => {
  it('fires on actual phase transitions', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const sight = createSight({ element: el, onPhaseChange: cb });

    mockIO.trigger(el, true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('visible', 'viewport');
    sight.dispose();
  });

  it('does NOT fire when phase stays the same', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const sight = createSight({ element: el, onPhaseChange: cb });

    mockIO.trigger(el, false);
    // unknown -> hidden (1 call)
    expect(cb).toHaveBeenCalledTimes(1);

    // Trigger hidden again — phase stays hidden, no new call
    setDocumentHidden(true);
    expect(cb).toHaveBeenCalledTimes(1);
    sight.dispose();
  });

  it('is optional (no error when omitted)', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });
    expect(() => mockIO.trigger(el, true)).not.toThrow();
    sight.dispose();
  });
});

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('phase returns hidden after dispose', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });
    mockIO.trigger(el, true);
    expect(sight.phase).toBe('visible');
    sight.dispose();
    expect(sight.phase).toBe('hidden');
  });

  it('reason resets to initial after dispose', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });
    mockIO.trigger(el, true);
    sight.dispose();
    expect(sight.phaseReason).toBe('initial');
  });

  it('no callbacks fire after dispose', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    const sight = createSight({ element: el, onPhaseChange: cb });

    mockIO.trigger(el, true);
    expect(cb).toHaveBeenCalledTimes(1);

    sight.dispose();
    cb.mockClear();

    mockIO.trigger(el, false);
    setDocumentHidden(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('dispose is idempotent', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const sight = createSight({ element: el });
    sight.dispose();
    expect(() => sight.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Rapid signal churn
// ---------------------------------------------------------------------------

describe('rapid signal churn', () => {
  it('IO visible->hidden->visible fires exactly 3 transitions', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    createSight({ element: el, onPhaseChange: cb });

    mockIO.trigger(el, true); // unknown->visible
    mockIO.trigger(el, false); // visible->hidden
    mockIO.trigger(el, true); // hidden->visible

    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('duplicate IO signal fires only once', async () => {
    const { createSight } = await getModule();
    const el = document.createElement('div');
    const cb = vi.fn();
    createSight({ element: el, onPhaseChange: cb });

    mockIO.trigger(el, true);
    mockIO.trigger(el, true); // duplicate — phase stays visible

    expect(cb).toHaveBeenCalledTimes(1);
  });
});
