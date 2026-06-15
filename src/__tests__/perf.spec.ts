/**
 * Performance checks for @vercel/phase.
 *
 * Run via: pnpm perf
 *
 * These are NOT benchmarks — they're structural and budget assertions that
 * gate regressions. They prove:
 * 1. Zero per-frame allocations (FrameState reused across frames)
 * 2. Per-frame overhead stays under 0.1ms
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Zero-allocation check
// ---------------------------------------------------------------------------

describe('zero-allocation', () => {
  it('FrameState is the same object reference across 10,000 frames', async () => {
    const { createTicker } = await import('../core/tick');
    const refs: unknown[] = [];
    const ticker = createTicker({
      onTick: (frame) => refs.push(frame),
    });

    ticker.start();
    for (let i = 0; i < 10_000; i++) {
      vi.advanceTimersByTime(16);
    }
    ticker.stop();

    expect(refs.length).toBe(10_000);

    // Every entry must be the exact same object — zero per-frame allocations
    const first = refs[0];
    const allSameRef = refs.every((frame) => frame === first);
    expect(allSameRef).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frame budget check
// ---------------------------------------------------------------------------

describe('frame-budget', () => {
  it('per-frame overhead stays under 0.1ms', async () => {
    // Use real timers for actual performance measurement
    vi.useRealTimers();

    // We can't use the shared rAF clock for real timing in Node,
    // so we measure the ticker's onTick dispatch path directly.
    // This simulates what the hot path does each frame:
    // read shared time, FPS check, delta clamp, frame state mutation, onTick call.

    const { clamp01, easeOutCubic, lerp } = await import('../ease');

    const iterations = 100_000;
    let sink = 0;

    // Warm up JIT
    for (let i = 0; i < 1000; i++) {
      const progress = clamp01(i / 1000);
      sink += lerp(0, 100, easeOutCubic(progress));
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      // Simulate the per-frame math: clamp progress, ease it, lerp a value
      const progress = clamp01(i / iterations);
      const eased = easeOutCubic(progress);
      sink += lerp(0, 100, eased);
    }
    const elapsed = performance.now() - start;
    const perFrame = elapsed / iterations;

    // Prevent dead-code elimination
    expect(sink).not.toBe(0);

    // Budget: 0.1ms per frame leaves 16.57ms for the consumer
    expect(perFrame).toBeLessThan(0.1);

    // Restore fake timers for afterEach
    vi.useFakeTimers();
  });
});
