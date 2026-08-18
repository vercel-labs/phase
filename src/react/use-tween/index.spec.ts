import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../__mocks__/match-media';

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
  const mod = await import('.');
  return mod.useTween;
}

describe('useTween', () => {
  it('returns the initial value on first render (no animation)', async () => {
    const useTween = await getHook();
    const { result } = renderHook(() => useTween({ to: 100 }));
    expect(result.current).toBe(100);
  });

  it('throws invalid_duration when duration is not a positive number', async () => {
    const useTween = await getHook();
    expect(() =>
      renderHook(() => useTween({ to: 100, duration: 0 })),
    ).toThrowError(/invalid duration/i);
    expect(() =>
      renderHook(() => useTween({ to: 100, duration: Number.NaN })),
    ).toThrowError(/invalid duration/i);
  });

  it('animates toward the new value after `to` changes', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to }: { to: number }) => useTween({ to, duration: 300 }),
      { initialProps: { to: 0 } },
    );
    expect(result.current).toBe(0);

    rerender({ to: 100 });
    // Advance partway through animation
    act(() => vi.advanceTimersByTime(150));
    // Should be somewhere between 0 and 100
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
  });

  it('reaches the final value when animation completes', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to }: { to: number }) => useTween({ to, duration: 300 }),
      { initialProps: { to: 0 } },
    );

    rerender({ to: 100 });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(100);
  });

  it.each([
    { from: 0, to: 100 },
    { from: 100, to: 0 },
  ])(
    'uses custom easing before landing exactly from $from to $to',
    async ({ from, to }) => {
      const useTween = await getHook();
      const easing = vi.fn(() => 0.5);
      const { result, rerender } = renderHook(
        ({ value }: { value: number }) =>
          useTween({ to: value, duration: 100, easing }),
        { initialProps: { value: from } },
      );

      rerender({ value: to });
      act(() => vi.advanceTimersByTime(50));
      expect(result.current).toBe((from + to) / 2);

      act(() => vi.advanceTimersByTime(100));
      expect(result.current).toBe(to);
      expect(easing).not.toHaveBeenCalledWith(1);
    },
  );

  it('uses the latest easing without restarting the active tween', async () => {
    const useTween = await getHook();
    const firstEasing = vi.fn(() => 0.25);
    const nextEasing = vi.fn(() => 0.75);
    const { result, rerender } = renderHook(
      ({ to, easing }: { to: number; easing: () => number }) =>
        useTween({ to, duration: 300, easing }),
      { initialProps: { to: 0, easing: firstEasing } },
    );

    rerender({ to: 100, easing: firstEasing });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe(25);

    rerender({ to: 100, easing: nextEasing });
    act(() => vi.advanceTimersByTime(16));
    expect(result.current).toBe(75);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(100);
  });

  it('enabled=false jumps to the destination immediately', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to, enabled }: { to: number; enabled: boolean }) =>
        useTween({ to, enabled, duration: 300 }),
      { initialProps: { to: 0, enabled: true } },
    );

    rerender({ to: 100, enabled: false });
    expect(result.current).toBe(100);
  });

  it('`to` change mid-animation starts from current position', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to }: { to: number }) => useTween({ to, duration: 300 }),
      { initialProps: { to: 0 } },
    );

    rerender({ to: 100 });
    act(() => vi.advanceTimersByTime(150));
    const midValue = result.current;
    expect(midValue).toBeGreaterThan(0);

    // Retarget to 200 — should start from midValue, not from 0
    rerender({ to: 200 });
    act(() => vi.advanceTimersByTime(16));
    // Value should be moving from midValue toward 200
    expect(result.current).toBeGreaterThanOrEqual(midValue);
  });

  it('delay keeps value at start before animating', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to }: { to: number }) => useTween({ to, duration: 300, delay: 500 }),
      { initialProps: { to: 0 } },
    );

    rerender({ to: 100 });

    // During delay period, value should still be 0
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe(0);

    // After delay + some animation time
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBeGreaterThan(0);
  });

  it('reducedMotion complete jumps to the destination', async () => {
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to }: { to: number }) =>
        useTween({ to, duration: 300, reducedMotion: 'complete' }),
      { initialProps: { to: 0 } },
    );

    rerender({ to: 100 });
    // Should jump immediately
    expect(result.current).toBe(100);
  });

  it('reducedMotion ignore still animates', async () => {
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ to }: { to: number }) =>
        useTween({ to, duration: 300, reducedMotion: 'ignore' }),
      { initialProps: { to: 0 } },
    );

    rerender({ to: 100 });
    act(() => vi.advanceTimersByTime(150));
    // Should be animating, not jumped
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
  });
});
