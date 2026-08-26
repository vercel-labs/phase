/**
 * Performance checks for phase.
 *
 * Run via: pnpm perf
 *
 * These are NOT benchmarks. They are structural and budget assertions that
 * gate regressions. They prove:
 * 1. Zero per-frame allocations (FrameState reused across frames)
 * 2. The real ticker dispatch path stays well under the frame budget
 * 3. React hooks never re-render from the frame loop
 */

import { renderHook, act } from '@testing-library/react';

import { createMockIntersectionObserver } from '../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../__mocks__/match-media';

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
  it('real ticker dispatch path stays well under the 16.6ms frame budget', async () => {
    // Use real timers so performance.now() measures actual wall-clock.
    vi.useRealTimers();

    // Capture the shared clock's rAF callback so we can drive the REAL tick
    // path synchronously in a tight loop — exercising the actual per-frame work
    // (shared-time read, FPS gate, delta clamp, FrameState mutation, dispatch)
    // rather than a stand-in for it.
    let rafCallback: FrameRequestCallback | null = null;
    const rafMock = vi.fn((cb: FrameRequestCallback): number => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', rafMock);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { createTicker } = await import('../core/tick');

    let sink = 0;
    const ticker = createTicker({
      onTick: (frame) => {
        // Touch every FrameState field so the dispatch can't be optimized away.
        sink += frame.delta + frame.elapsed + frame.frame + frame.time;
      },
    });
    ticker.start();

    let timestamp = 0;
    const driveFrame = (): void => {
      timestamp += 1000 / 60;
      rafCallback?.(timestamp);
    };

    // Warm up the JIT on the real dispatch path.
    for (let i = 0; i < 1000; i++) driveFrame();

    const iterations = 100_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) driveFrame();
    const elapsed = performance.now() - start;
    const perFrame = elapsed / iterations;

    ticker.stop();

    // Prevent dead-code elimination.
    expect(sink).not.toBe(0);

    // Generous budget: the real dispatch arithmetic is sub-microsecond. A bound
    // of 0.1ms (1/166th of a frame) catches gross regressions without flaking.
    expect(perFrame).toBeLessThan(0.1);

    vi.unstubAllGlobals();
    // Restore fake timers for afterEach.
    vi.useFakeTimers();
  });
});

// ---------------------------------------------------------------------------
// React zero re-render check
// ---------------------------------------------------------------------------

describe('react-zero-rerender', () => {
  it('useLoop does not re-render during the frame loop', async () => {
    const mockIO = createMockIntersectionObserver();
    const mockMM = createMockMatchMedia();
    vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
    vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });

    const { useLoop } = await import('../react/use-loop');

    const el = document.createElement('div');
    const ref = { current: el };

    let renderCount = 0;
    let tickCount = 0;

    const { result } = renderHook(() => {
      renderCount++;
      return useLoop({
        ref,
        onTick: () => {
          tickCount++;
        },
      });
    });

    const rendersBeforeStart = renderCount;

    // Make the element visible — loop starts, triggers one phase change re-render
    act(() => mockIO.trigger(el, true));

    expect(result.current.phase).toBe('running');
    const rendersAfterStart = renderCount;

    // Run 200 frames at 16ms — the hot path
    act(() => {
      for (let i = 0; i < 200; i++) {
        vi.advanceTimersByTime(16);
      }
    });

    expect(tickCount).toBe(200);

    // The contract: 200 frames fired, but render count didn't increase.
    // Only phase transitions cause re-renders, not ticks.
    expect(renderCount).toBe(rendersAfterStart);

    // Sanity: we did re-render for the phase transition, not zero total
    expect(rendersAfterStart).toBeGreaterThan(rendersBeforeStart);

    vi.unstubAllGlobals();
  });
});
