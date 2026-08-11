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
      expect(loop.qualityBehavior).toBeUndefined();
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
      expect(loop.qualityBehavior).toBe('pause');
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

  describe('quality is observable independent of behavior', () => {
    it("unfocused: 'throttle' keeps the loop running while degraded", async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        unfocused: 'throttle',
      });
      makeSightVisible(el);

      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));

      expect(loop.phase).toBe('running');
      expect(loop.quality).toBe('degraded');
      loop.stop();
    });

    it('onQualityChange reports quality and reason transitions', async () => {
      const { createLoop } = await getModule();
      const el = document.createElement('div');
      const onQualityChange = vi.fn();
      const loop = createLoop({
        element: el,
        onTick: vi.fn(),
        unfocused: 'ignore',
        onQualityChange,
      });
      makeSightVisible(el);

      const hasFocusSpy = vi.spyOn(document, 'hasFocus');
      hasFocusSpy.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
      expect(onQualityChange).toHaveBeenLastCalledWith(
        'degraded',
        'unfocused',
        'ignore',
      );

      hasFocusSpy.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));
      expect(onQualityChange).toHaveBeenLastCalledWith(
        'full',
        undefined,
        undefined,
      );
      expect(onQualityChange).toHaveBeenCalledTimes(2);
      loop.stop();
    });
  });
});

describe('per-signal behavior - unfocused', () => {
  it('default: blur pauses the loop with reason=degraded', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ element: el, onTick: vi.fn() });
    makeSightVisible(el);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('degraded');
    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('unfocused');
    expect(loop.qualityBehavior).toBe('pause');
    loop.stop();
  });

  it('default: focus resumes the loop and quality recovers', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({ element: el, onTick: vi.fn() });
    makeSightVisible(el);

    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.phase).toBe('paused');

    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(loop.phase).toBe('running');
    expect(loop.phaseReason).toBe('resumed');
    expect(loop.quality).toBe('full');
    loop.stop();
  });

  it("'ignore': quality updates but the loop keeps running", async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const loop = createLoop({
      element: el,
      onTick: vi.fn(),
      unfocused: 'ignore',
    });
    makeSightVisible(el);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    expect(loop.phase).toBe('running');
    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('unfocused');
    expect(loop.qualityBehavior).toBe('ignore');
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
    /** Step the clock forward without dispatching a frame. */
    skip(ms: number): void {
      clock += ms;
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
    const loop = createLoop({ element: el, onTick: vi.fn() });
    makeSightVisible(el);

    degradeViaBudget(clock);

    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('frame-budget');
    clock.restore();
    loop.stop();
  });

  it('throttle rebuild keeps delta, elapsed, frame count, and identity exact', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const refs: unknown[] = [];
    const last = { time: 0, delta: 0, elapsed: 0, frame: 0 };
    const loop = createLoop({
      element: el,
      onTick: (frame) => {
        refs.push(frame);
        Object.assign(last, frame);
      },
    });
    makeSightVisible(el); // timeline starts at clock=0

    // Ticks at 16, 51, 86, 121; the 3 consecutive 35ms deltas degrade quality.
    degradeViaBudget(clock);
    expect(loop.qualityReason).toBe('frame-budget');
    expect(last.frame).toBe(4);
    expect(last.elapsed).toBe(121);

    await Promise.resolve(); // run the queued 30fps ticker rebuild

    // First tick of the replacement ticker: the 35ms gap spans the rebuild
    // and must be fully accounted for in both delta and elapsed.
    clock.advance(OVER_BUDGET_DELTA); // tick at 156
    expect(last.delta).toBe(35);
    expect(last.elapsed).toBe(156);
    expect(last.frame).toBe(5);

    // The 30fps gate skips sub-interval frames; the next delivered tick's
    // delta spans the skipped frame and stays on the same continuous timeline.
    clock.advance(16); // clock=172: 16 < 33.3ms interval, skipped
    expect(last.frame).toBe(5);
    clock.advance(20); // tick at 192
    expect(last.delta).toBe(36);
    expect(last.elapsed).toBe(192);
    expect(last.frame).toBe(6);

    // Zero per-frame allocations: one FrameState object across rebuilds.
    expect(refs.every((r) => r === refs[0])).toBe(true);
    clock.restore();
    loop.stop();
  });

  it("frameBudget: 'pause' degrades then recovers via timer (not permanent)", async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({
      element: el,
      onTick: vi.fn(),
      frameBudget: 'pause',
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

  it("frameBudget: 'pause': stop() cancels a pending recovery timer", async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({
      element: el,
      onTick: vi.fn(),
      frameBudget: 'pause',
    });
    makeSightVisible(el);

    degradeViaBudget(clock);
    loop.stop();

    // Timer firing after stop must not throw or resurrect the loop.
    await vi.advanceTimersByTimeAsync(RECOVERY_RETRY_MS);
    expect(loop.phase).toBe('stopped');
    clock.restore();
  });

  it("frameBudget: 'ignore': quality degrades but fps and phase are untouched", async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const cb = vi.fn();
    const loop = createLoop({
      element: el,
      onTick: cb,
      frameBudget: 'ignore',
    });
    makeSightVisible(el);

    degradeViaBudget(clock);
    expect(loop.phase).toBe('running');
    expect(loop.quality).toBe('degraded');
    expect(loop.qualityReason).toBe('frame-budget');

    // No throttle: every ~16ms frame still ticks (no 30fps gate).
    await Promise.resolve();
    const ticksBefore = cb.mock.calls.length;
    clock.advance(16);
    clock.advance(16);
    expect(cb.mock.calls.length).toBe(ticksBefore + 2);
    clock.restore();
    loop.stop();
  });

  it('resolved behavior is independent of reporting-priority reason', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const loop = createLoop({
      element: el,
      onTick: vi.fn(),
      unfocused: 'ignore',
      frameBudget: 'pause',
    });
    makeSightVisible(el);

    degradeViaBudget(clock);
    expect(loop.phase).toBe('paused');
    expect(loop.qualityReason).toBe('frame-budget');
    expect(loop.qualityBehavior).toBe('pause');

    // Unfocused reports first, but the active frame-budget pause still wins.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.qualityReason).toBe('unfocused');
    expect(loop.qualityBehavior).toBe('pause');
    expect(loop.phase).toBe('paused');

    clock.restore();
    loop.stop();
  });
});

// ---------------------------------------------------------------------------
// Frame timeline continuity
//
// The loop owns the consumer-facing FrameState. Quality-driven ticker rebuilds
// (focus loss/gain, frame-budget throttling) and visibility pauses must never
// reset or skew delta, elapsed, or the frame counter. Assertions are exact
// values, not monotonicity, so a reset or a dropped gap cannot pass.
// ---------------------------------------------------------------------------

type CreateLoop = Awaited<ReturnType<typeof getModule>>['createLoop'];
type LoopExtraOptions = Partial<Parameters<CreateLoop>[0]>;

function trackLoop(
  createLoop: CreateLoop,
  el: Element,
  extra?: LoopExtraOptions,
) {
  const refs: unknown[] = [];
  const last = { time: 0, delta: 0, elapsed: 0, frame: 0 };
  const loop = createLoop({
    element: el,
    onTick: (frame) => {
      refs.push(frame);
      Object.assign(last, frame);
    },
    ...extra,
  });
  return { loop, refs, last };
}

describe('frame timeline continuity', () => {
  it('focus-driven rebuilds do not drop running time between ticks', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    // Explicit throttle: the default (pause) never rebuilds on focus changes,
    // and this test exists to exercise the rebuild path.
    const { loop, refs, last } = trackLoop(createLoop, el, {
      unfocused: 'throttle',
    });
    makeSightVisible(el); // timeline starts at clock=0

    clock.advance(16); // tick 1 at 16
    expect(last.delta).toBeCloseTo(16.67); // first-ever tick default
    expect(last.elapsed).toBe(16);
    expect(last.frame).toBe(1);

    // Blur 10ms after the last tick: no frame has observed that 10ms yet, but
    // it is running time and must stay on the timeline across the rebuild.
    clock.skip(10); // clock=26
    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    await Promise.resolve(); // rebuild at degraded 30fps

    clock.advance(25); // tick 2 at 51
    expect(last.delta).toBe(35); // 51 - 16, spanning the rebuild
    expect(last.elapsed).toBe(51);
    expect(last.frame).toBe(2);

    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve(); // rebuild back at full fps

    clock.advance(16); // tick 3 at 67
    expect(last.delta).toBe(16);
    expect(last.elapsed).toBe(67);
    expect(last.frame).toBe(3);

    expect(refs.every((r) => r === refs[0])).toBe(true);
    clock.restore();
    loop.stop();
  });

  it('delta spanning a rebuild is still clamped to 40ms', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const { loop, last } = trackLoop(createLoop, el, {
      unfocused: 'throttle',
    });
    makeSightVisible(el);

    clock.advance(16); // tick 1 at 16
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    await Promise.resolve(); // rebuild

    clock.advance(120); // tick 2 at 136
    expect(last.delta).toBe(40); // clamped, no teleport
    expect(last.elapsed).toBe(136); // elapsed stays wall-accurate
    expect(last.frame).toBe(2);
    clock.restore();
    loop.stop();
  });

  it('elapsed excludes paused time and resume gets a clean delta', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const { loop, last } = trackLoop(createLoop, el);
    makeSightVisible(el);

    clock.advance(16); // tick 1 at 16
    expect(last.elapsed).toBe(16);

    makeSightHidden(el); // pause at clock=16
    expect(loop.phase).toBe('paused');
    clock.skip(1000); // paused time, must not appear in delta or elapsed
    makeSightVisible(el); // resume at clock=1016

    clock.advance(16); // tick 2 at 1032
    expect(last.delta).toBeCloseTo(16.67); // clean default, not the pause gap
    expect(last.elapsed).toBe(32); // 1032 - 1000 paused
    expect(last.frame).toBe(2);
    clock.restore();
    loop.stop();
  });

  it('mixed signals: frame-budget throttle + unfocused pause stay continuous', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    // Defaults: unfocused 'pause', frameBudget 'throttle'.
    const { loop, refs, last } = trackLoop(createLoop, el);
    makeSightVisible(el); // timeline starts at clock=0

    // Ticks at 16, 51, 86, 121: three 35ms deltas degrade via frame budget.
    clock.advance(16);
    clock.advance(35);
    clock.advance(35);
    clock.advance(35);
    expect(loop.qualityReason).toBe('frame-budget');
    expect(loop.phase).toBe('running'); // throttle keeps running
    await Promise.resolve(); // rebuild at 30fps; frame budget remains active

    // Blur before the next tick can clear the frame-budget counter. Both
    // signals are active: unfocused pause wins over frame-budget throttle.
    clock.skip(10); // 10ms of running time before the pause
    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    hasFocusSpy.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('degraded');
    expect(loop.qualityReason).toBe('unfocused');
    expect(loop.qualityBehavior).toBe('pause');

    clock.skip(1000); // paused time, excluded from the timeline
    hasFocusSpy.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(loop.phase).toBe('running');
    expect(loop.qualityReason).toBe('frame-budget');
    expect(loop.qualityBehavior).toBe('throttle');

    clock.advance(35); // tick 5 at 1166, still throttled
    expect(last.delta).toBeCloseTo(16.67); // clean post-resume delta
    expect(last.elapsed).toBe(166); // 121 + 10 running + 35, pause excluded
    expect(last.frame).toBe(5);

    // A later quality reconciliation observes the recovered frame budget.
    window.dispatchEvent(new Event('focus'));
    expect(loop.quality).toBe('full');
    await Promise.resolve(); // rebuild back at full fps

    clock.advance(16); // tick 6 at 1182
    expect(last.delta).toBe(16);
    expect(last.elapsed).toBe(182);
    expect(last.frame).toBe(6);
    expect(refs.every((r) => r === refs[0])).toBe(true);
    clock.restore();
    loop.stop();
  });
});

// ---------------------------------------------------------------------------
// Reduced-motion paint
//
// With reducedMotion 'pause' active from the start the loop never ticks, which
// leaves canvas surfaces blank. The loop delivers exactly one frame (elapsed 0)
// once the element is first visible, then stays paused.
// ---------------------------------------------------------------------------

describe('reduced-motion paint', () => {
  it('paints exactly one frame once the element becomes visible', async () => {
    const { createLoop } = await getModule();
    enableReducedMotion();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const { loop, last, refs } = trackLoop(createLoop, el);

    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('reduced-motion');

    // Not visible yet: no paint is scheduled.
    clock.advance(16);
    expect(last.frame).toBe(0);

    // First visibility triggers the deferred one-shot paint.
    makeSightVisible(el);
    clock.advance(16); // paint fires at clock=32
    expect(last.frame).toBe(1);
    expect(last.elapsed).toBe(0);
    expect(last.delta).toBeCloseTo(16.67);

    // Still paused: no further frames.
    clock.advance(16);
    clock.advance(16);
    expect(last.frame).toBe(1);
    expect(loop.phase).toBe('paused');

    // Reduced motion lifts at clock=64: the real timeline starts fresh.
    disableReducedMotion();
    expect(loop.phase).toBe('running');
    clock.advance(16); // tick at 80
    expect(last.frame).toBe(2);
    expect(last.delta).toBeCloseTo(16.67);
    expect(last.elapsed).toBe(16);
    expect(refs.every((r) => r === refs[0])).toBe(true);
    clock.restore();
    loop.stop();
  });

  it('does not paint when reduced motion activates mid-run', async () => {
    const { createLoop } = await getModule();
    const clock = setupManualClock();
    const el = document.createElement('div');
    const { loop, last } = trackLoop(createLoop, el);
    makeSightVisible(el);

    clock.advance(16); // tick 1
    expect(last.frame).toBe(1);

    enableReducedMotion();
    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('reduced-motion');

    // The last painted frame is already on screen, so no extra paint.
    clock.advance(16);
    clock.advance(16);
    expect(last.frame).toBe(1);
    clock.restore();
    loop.stop();
  });
});

// ---------------------------------------------------------------------------
// Removed options (type-level)
// ---------------------------------------------------------------------------

describe('removed options (type-level)', () => {
  it('rejects the pre-0.0.9 degraded API and loop complete', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');

    const loop = createLoop({
      element: el,
      onTick: vi.fn(),
      start: 'manual',
      // @ts-expect-error -- replaced by `unfocused` / `frameBudget`
      degraded: 'pause',
    });
    loop.stop();

    const loop2 = createLoop({
      element: el,
      onTick: vi.fn(),
      start: 'manual',
      // @ts-expect-error -- replaced by `throttleFps`
      degradedFps: 24,
    });
    loop2.stop();

    const loop3 = createLoop({
      element: el,
      onTick: vi.fn(),
      start: 'manual',
      // @ts-expect-error -- loops have no end state; 'complete' is tween-only
      reducedMotion: 'complete',
    });
    loop3.stop();
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

  it('aborting the signal stops the loop', async () => {
    const { createLoop } = await getModule();
    const el = document.createElement('div');
    const controller = new AbortController();
    const loop = createLoop({
      element: el,
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
// SSR
// ---------------------------------------------------------------------------

describe('SSR', () => {
  it('createLoop throws when requestAnimationFrame is undefined', async () => {
    const origRaf = globalThis.requestAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.resetModules();
    const { createLoop } = await import('.');
    const el = document.createElement('div');
    expect(() => createLoop({ element: el, onTick: vi.fn() })).toThrow();
    vi.stubGlobal('requestAnimationFrame', origRaf);
  });
});
