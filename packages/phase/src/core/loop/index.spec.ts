import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';
import type { FrameState } from '../tick';

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
// Timeline continuity across FPS policy changes
// ---------------------------------------------------------------------------

describe('timeline continuity across FPS policy changes', () => {
  it('blur -> refocus preserves FrameState identity, frame count, and elapsed', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');

    const identities = new Set<FrameState>();
    const frameCounts: number[] = [];
    const elapsedValues: number[] = [];
    const loop = createLoop({
      target: el,
      onTick: (frame) => {
        identities.add(frame);
        frameCounts.push(frame.frame);
        elapsedValues.push(frame.elapsed);
      },
    });
    makeSightVisible(el);

    clock.advance(16);
    clock.advance(16);
    clock.advance(16);

    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.quality).toBe('degraded');
    await Promise.resolve(); // flush any queued policy work

    clock.advance(34);
    clock.advance(34);

    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(loop.quality).toBe('full');
    await Promise.resolve();

    clock.advance(16);
    clock.advance(16);

    // One FrameState object across the entire run — the ticker was never replaced.
    expect(identities.size).toBe(1);
    // Frame count never resets: strictly +1 per delivery.
    let prevCount: number | undefined;
    for (const count of frameCounts) {
      if (prevCount !== undefined) expect(count).toBe(prevCount + 1);
      prevCount = count;
    }
    // Elapsed never restarts from zero.
    let prevElapsed = Number.NEGATIVE_INFINITY;
    for (const elapsed of elapsedValues) {
      expect(elapsed).toBeGreaterThanOrEqual(prevElapsed);
      prevElapsed = elapsed;
    }
    loop.stop();
    clock.restore();
  });
});

describe('FPS policy cadence', () => {
  it('uncapped degrades to 30 FPS and returns to uncapped', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const onTick = vi.fn();
    const loop = createLoop({ target: el, onTick });
    makeSightVisible(el);

    // Uncapped: every 16ms source frame delivers.
    onTick.mockClear();
    for (let i = 0; i < 10; i++) clock.advance(16);
    expect(onTick).toHaveBeenCalledTimes(10);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    // Degraded to 30 FPS: at most one delivery per 33.3ms, applied from the
    // very next source frame (no uncapped transition frame).
    onTick.mockClear();
    for (let i = 0; i < 10; i++) clock.advance(16);
    expect(onTick.mock.calls.length).toBeLessThanOrEqual(5);
    expect(onTick.mock.calls.length).toBeGreaterThanOrEqual(4);

    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));

    // Back to uncapped: every source frame delivers again.
    onTick.mockClear();
    for (let i = 0; i < 10; i++) clock.advance(16);
    expect(onTick).toHaveBeenCalledTimes(10);

    loop.stop();
    clock.restore();
  });

  it('a base fps below the degraded cap is unchanged by degradation', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const onTick = vi.fn();
    const loop = createLoop({ target: el, onTick, fps: 20 });
    makeSightVisible(el);

    // 20 FPS = 50ms interval: 8 source frames at 25ms = 200ms -> 4 deliveries.
    onTick.mockClear();
    for (let i = 0; i < 8; i++) clock.advance(25);
    const baselineDeliveries = onTick.mock.calls.length;

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    // min(20, 30) = 20: cadence unchanged while degraded.
    onTick.mockClear();
    for (let i = 0; i < 8; i++) clock.advance(25);
    expect(onTick.mock.calls.length).toBe(baselineDeliveries);

    loop.stop();
    clock.restore();
  });

  it('re-derives the frame budget when quality recovers', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({ target: el, onTick: vi.fn() });
    makeSightVisible(el);
    clock.advance(16);

    // Degrade (budget 33.3ms) and recover (budget back to 16.7ms).
    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(loop.quality).toBe('full');

    // 30ms frames are over budget against the recovered uncapped budget
    // (16.7 * 1.5 = 25ms) but would pass a stale degraded budget (50ms).
    clock.advance(30);
    clock.advance(30);
    clock.advance(30);
    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('frame-budget');

    loop.stop();
    clock.restore();
  });

  it('respects a configured degradedFps', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const onTick = vi.fn();
    const loop = createLoop({ target: el, onTick, degradedFps: 10 });
    makeSightVisible(el);

    clock.advance(16);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    // 10 FPS = 100ms interval: 8 source frames at 25ms = 200ms -> 2 deliveries.
    onTick.mockClear();
    for (let i = 0; i < 8; i++) clock.advance(25);
    expect(onTick.mock.calls.length).toBe(2);

    loop.stop();
    clock.restore();
  });
});

describe('FPS policy while paused', () => {
  it('a quality change during pause applies its cap on resume', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const onTick = vi.fn();
    const loop = createLoop({ target: el, onTick });
    makeSightVisible(el);
    for (let i = 0; i < 4; i++) clock.advance(16);

    makeSightHidden(el);
    expect(loop.phase).toBe('paused');

    // Blur while paused: quality degrades, the 30 FPS cap must not be lost.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.quality).toBe('degraded');

    makeSightVisible(el);
    expect(loop.phase).toBe('running');

    // 8 source frames at 16ms = 128ms. Uncapped would deliver all 8; the
    // degraded 30 FPS cap must throttle them.
    onTick.mockClear();
    for (let i = 0; i < 8; i++) clock.advance(16);
    expect(onTick.mock.calls.length).toBeLessThan(8);

    loop.stop();
    clock.restore();
  });

  it('lifecycle pause freezes elapsed and resumes with a clean delta', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    let lastElapsed = 0;
    let lastDelta = 0;
    const loop = createLoop({
      target: el,
      onTick: (frame) => {
        lastElapsed = frame.elapsed;
        lastDelta = frame.delta;
      },
    });
    makeSightVisible(el);
    for (let i = 0; i < 4; i++) clock.advance(16);
    const elapsedBeforePause = lastElapsed;

    makeSightHidden(el);
    clock.advance(500); // time passes while strong-paused; no deliveries

    makeSightVisible(el);
    clock.advance(16);

    // Elapsed excludes the paused 500ms and the resume delta is clean (no
    // pause gap). Continuity only — exact delta bounds belong to the ticker.
    expect(lastElapsed - elapsedBeforePause).toBeLessThan(500);
    expect(lastDelta).toBeLessThan(500);

    loop.stop();
    clock.restore();
  });
});

describe('fps validation', () => {
  const invalidValues = [0, -1, Number.NaN, Infinity, -Infinity];

  it.each(invalidValues)('rejects fps: %s at construction', async (value) => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    expect(() =>
      createLoop({ target: el, onTick: vi.fn(), fps: value, start: 'manual' }),
    ).toThrow(/invalid fps/);
  });

  it.each(invalidValues)(
    'rejects degradedFps: %s at construction, even in manual start',
    async (value) => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      expect(() =>
        createLoop({
          target: el,
          onTick: vi.fn(),
          degradedFps: value,
          start: 'manual',
        }),
      ).toThrow(/invalid fps/);
    },
  );

  it('rejects an invalid degradedFps even when the degraded path is inactive', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    // Runtime JS can pass degradedFps alongside degraded: 'pause' despite the
    // type union forbidding it; the value is validated regardless.
    const options = {
      target: el,
      onTick: vi.fn(),
      degraded: 'pause',
      degradedFps: -5,
      start: 'manual',
    };
    expect(() =>
      createLoop(options as unknown as Parameters<typeof createLoop>[0]),
    ).toThrow(/invalid fps/);
  });
});

describe('stop is terminal for the ticker', () => {
  it('no frames deliver after stop()', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const onTick = vi.fn();
    const loop = createLoop({ target: el, onTick });
    makeSightVisible(el);
    clock.advance(16);
    expect(onTick).toHaveBeenCalled();

    loop.stop();

    onTick.mockClear();
    for (let i = 0; i < 5; i++) clock.advance(16);
    expect(onTick).not.toHaveBeenCalled();
    clock.restore();
  });

  it('stop from paused leaves no ticker to resurrect', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const onTick = vi.fn();
    const loop = createLoop({ target: el, onTick });
    makeSightVisible(el);
    clock.advance(16);
    makeSightHidden(el);
    expect(loop.phase).toBe('paused');

    loop.stop();

    onTick.mockClear();
    for (let i = 0; i < 5; i++) clock.advance(16);
    expect(onTick).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// Page anchor (document)
// ---------------------------------------------------------------------------

describe('page anchor', () => {
  it('runs a page-anchored loop with no observer', async () => {
    const { createLoop } = await getModule();
    const onTick = vi.fn();

    const loop = createLoop({ target: document, onTick });

    expect(mockIO.instances).toHaveLength(0);
    expect(loop.phase).toBe('running');

    await vi.advanceTimersByTimeAsync(32);
    expect(onTick).toHaveBeenCalled();
    loop.stop();
  });

  it('strong-pauses when the tab is hidden', async () => {
    const { createLoop } = await getModule();
    const onTick = vi.fn();
    const loop = createLoop({ target: document, onTick });

    await vi.advanceTimersByTimeAsync(32);
    expect(onTick).toHaveBeenCalled();

    setDocumentHidden(true);
    expect(loop.phase).toBe('paused');
    onTick.mockClear();

    await vi.advanceTimersByTimeAsync(200);
    expect(onTick).not.toHaveBeenCalled();

    setDocumentHidden(false);
    expect(loop.phase).toBe('running');
    await vi.advanceTimersByTimeAsync(32);
    expect(onTick).toHaveBeenCalled();
    loop.stop();
  });
});
