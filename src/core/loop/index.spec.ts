import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';

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
  return import('.');
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
        target: el,
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
        target: el,
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
      makeSightVisible(el);

      enableReducedMotion();
      expect(loop.phase).toBe('paused');
      expect(loop.phaseReason).toBe('reduced-motion');
      loop.stop();
    });

    it('reduced motion takes priority over sight', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
        target: el,
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
      makeSightVisible(el);
      enableReducedMotion();
      expect(loop.phase).toBe('paused');
      loop.stop();
    });

    it('resumes when preference changes back', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
        target: el,
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
        target: el,
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
      makeSightVisible(el);

      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));

      expect(loop.phase).toBe('running');
      expect(loop.quality).toBe('degraded');
      loop.stop();
    });
  });
});

describe('quality signal - degraded option', () => {
  it('degraded: pause + unfocused -> loop pauses with reason=degraded', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({
      target: el,
      onTick: vi.fn(),
      degraded: 'pause',
    });
    makeSightVisible(el);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('degraded');
    expect(loop.quality).toBe('degraded');
    loop.stop();
  });

  it('degraded: ignore + unfocused -> quality updates but loop keeps running', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({
      target: el,
      onTick: vi.fn(),
      degraded: 'ignore',
    });
    makeSightVisible(el);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    expect(loop.phase).toBe('running');
    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('unfocused');
    loop.stop();
  });

  it('degraded: pause recovers when focus returns', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({
      target: el,
      onTick: vi.fn(),
      degraded: 'pause',
    });
    makeSightVisible(el);

    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.phase).toBe('paused');

    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(loop.phase).toBe('running');
    expect(loop.quality).toBe('full');
    loop.stop();
  });
});

// ---------------------------------------------------------------------------
// Quality signal - frame budget
// ---------------------------------------------------------------------------

// Pause-mode frame-budget recovery delay (must mirror the constant in index.ts).
const RECOVERY_RETRY_MS = 2000;

/**
 * Drives the loop's ticker with a manually controlled clock. The default fake
 * timer rAF fires fixed ~16ms frames, which can never go over budget. To
 * exercise the frame-budget path we stub `performance.now` + rAF and step the
 * clock by arbitrary deltas. `setTimeout` (used by recovery) stays on fake
 * timers, advanced separately via `vi.advanceTimersByTime`.
 */
function setupManualClock() {
  let clock = 0;
  let rafCb: FrameRequestCallback | null = null;
  const raf = vi.fn((cb: FrameRequestCallback): number => {
    rafCb = cb;
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

  return {
    /** Step the clock forward and dispatch one frame at the new time. */
    advance(ms: number): void {
      clock += ms;
      rafCb?.(clock);
    },
    restore(): void {
      nowSpy.mockRestore();
    },
  };
}

describe('quality signal - frame budget', () => {
  // A delta over budget*1.5 (25ms at 60fps) for 3 consecutive frames degrades.
  const OVER_BUDGET_DELTA = 35;

  function degradeViaBudget(clock: ReturnType<typeof setupManualClock>): void {
    clock.advance(16); // first frame uses default delta (under budget)
    clock.advance(OVER_BUDGET_DELTA);
    clock.advance(OVER_BUDGET_DELTA);
    clock.advance(OVER_BUDGET_DELTA);
  }

  it('3 over-budget frames -> degraded, reason=frame-budget', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({ target: el, onTick: vi.fn() });
    makeSightVisible(el);

    degradeViaBudget(clock);

    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('frame-budget');
    clock.restore();
    loop.stop();
  });

  it('pause: degrades then recovers via timer (not permanent)', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({
      target: el,
      onTick: vi.fn(),
      degraded: 'pause',
    });
    makeSightVisible(el);

    degradeViaBudget(clock);
    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('degraded');

    // No frames tick while paused — recovery must come from the timer alone.
    await vi.advanceTimersByTimeAsync(RECOVERY_RETRY_MS);
    expect(loop.phase).toBe('running');
    expect(loop.quality).toBe('full');
    clock.restore();
    loop.stop();
  });

  it('pause: stop() cancels a pending recovery timer', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({
      target: el,
      onTick: vi.fn(),
      degraded: 'pause',
    });
    makeSightVisible(el);

    degradeViaBudget(clock);
    loop.stop();

    // Timer firing after stop must not throw or resurrect the loop.
    await vi.advanceTimersByTimeAsync(RECOVERY_RETRY_MS);
    expect(loop.phase).toBe('stopped');
    clock.restore();
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
      target: el,
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
      const loop = createLoop({ target: el, onTick: vi.fn() });
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
    const loop = createLoop({ target: el, onTick: vi.fn() });
    loop.stop();
    expect(() => loop.stop()).not.toThrow();
  });

  it('aborting the signal stops the loop', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const controller = new AbortController();
    const loop = createLoop({
      target: el,
      onTick: vi.fn(),
      signal: controller.signal,
    });
    makeSightVisible(el);
    expect(loop.phase).toBe('running');

    controller.abort();
    expect(loop.phase).toBe('stopped');
  });
});

// ---------------------------------------------------------------------------
// Compound signal changes
// ---------------------------------------------------------------------------

describe('compound signal changes', () => {
  it('sight hidden AND reduced motion -> reason is reduced-motion (priority)', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ target: el, onTick: vi.fn() });
    makeSightVisible(el);

    enableReducedMotion();
    makeSightHidden(el);

    expect(loop.phaseReason).toBe('reduced-motion');
    loop.stop();
  });

  it('quality degrades while paused: no crash', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ target: el, onTick: vi.fn() });
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
// SSR
// ---------------------------------------------------------------------------

describe('SSR', () => {
  it('createLoop throws when requestAnimationFrame is undefined', async () => {
    const origRaf = globalThis.requestAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.resetModules();
    const { createLoop } = await import('.');
    const el = document.createElement('div');
    expect(() => createLoop({ target: el, onTick: vi.fn() })).toThrow();
    vi.stubGlobal('requestAnimationFrame', origRaf);
  });
});
