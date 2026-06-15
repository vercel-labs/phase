import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../tests/mocks.js';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('./index.js');
  return mod.useTween;
}

describe('useTween', () => {
  it('returns initial target on first render (no animation)', async () => {
    const useTween = await getHook();
    const { result } = renderHook(() => useTween({ target: 100 }));
    expect(result.current).toBe(100);
  });

  it('animates toward new target after target changes', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) => useTween({ target, duration: 300 }),
      { initialProps: { target: 0 } },
    );
    expect(result.current).toBe(0);

    rerender({ target: 100 });
    // Advance partway through animation
    act(() => vi.advanceTimersByTime(150));
    // Should be somewhere between 0 and 100
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
  });

  it('reaches final target value when animation completes', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) => useTween({ target, duration: 300 }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(100);
  });

  it('enabled=false jumps to target immediately', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target, enabled }: { target: number; enabled: boolean }) =>
        useTween({ target, enabled, duration: 300 }),
      { initialProps: { target: 0, enabled: true } },
    );

    rerender({ target: 100, enabled: false });
    expect(result.current).toBe(100);
  });

  it('target change mid-animation starts from current position', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) => useTween({ target, duration: 300 }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    act(() => vi.advanceTimersByTime(150));
    const midValue = result.current;
    expect(midValue).toBeGreaterThan(0);

    // Retarget to 200 — should start from midValue, not from 0
    rerender({ target: 200 });
    act(() => vi.advanceTimersByTime(16));
    // Value should be moving from midValue toward 200
    expect(result.current).toBeGreaterThanOrEqual(midValue);
  });

  it('delay keeps value at start before animating', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) =>
        useTween({ target, duration: 300, delay: 500 }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });

    // During delay period, value should still be 0
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe(0);

    // After delay + some animation time
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBeGreaterThan(0);
  });

  it('reducedMotion complete jumps to target', async () => {
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) =>
        useTween({ target, duration: 300, reducedMotion: 'complete' }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    // Should jump immediately
    expect(result.current).toBe(100);
  });

  it('reducedMotion ignore still animates', async () => {
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) =>
        useTween({ target, duration: 300, reducedMotion: 'ignore' }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    act(() => vi.advanceTimersByTime(150));
    // Should be animating, not jumped
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
  });
});
