import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../__mocks__/match-media';
import type { TweenReducedMotion } from '../index';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useTween;
}

describe('useTween', () => {
  it('exports only the supported reduced-motion modes', () => {
    expectTypeOf<TweenReducedMotion>().toEqualTypeOf<'complete' | 'ignore'>();
    // @ts-expect-error useTween cannot pause a finite tween
    expectTypeOf<'pause'>().toMatchTypeOf<TweenReducedMotion>();
  });

  it('returns initial target on first render (no animation)', async () => {
    const useTween = await getHook();
    const { result } = renderHook(() => useTween({ target: 100 }));
    expect(result.current).toBe(100);
  });

  it('throws invalid_duration when duration is not a positive number', async () => {
    const useTween = await getHook();
    expect(() =>
      renderHook(() => useTween({ target: 100, duration: 0 })),
    ).toThrowError(/invalid duration/i);
    expect(() =>
      renderHook(() => useTween({ target: 100, duration: Number.NaN })),
    ).toThrowError(/invalid duration/i);
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

  it.each([
    { from: 0, target: 100 },
    { from: 100, target: 0 },
  ])(
    'uses custom easing before landing exactly from $from to $target',
    async ({ from, target }) => {
      const useTween = await getHook();
      const easing = vi.fn(() => 0.5);
      const { result, rerender } = renderHook(
        ({ value }: { value: number }) =>
          useTween({ target: value, duration: 100, easing }),
        { initialProps: { value: from } },
      );

      rerender({ value: target });
      act(() => vi.advanceTimersByTime(50));
      expect(result.current).toBe((from + target) / 2);

      act(() => vi.advanceTimersByTime(100));
      expect(result.current).toBe(target);
      expect(easing).not.toHaveBeenCalledWith(1);
    },
  );

  it('uses the latest easing without restarting the active tween', async () => {
    const useTween = await getHook();
    const firstEasing = vi.fn(() => 0.25);
    const nextEasing = vi.fn(() => 0.75);
    const { result, rerender } = renderHook(
      ({ target, easing }: { target: number; easing: () => number }) =>
        useTween({ target, duration: 300, easing }),
      { initialProps: { target: 0, easing: firstEasing } },
    );

    rerender({ target: 100, easing: firstEasing });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe(25);

    rerender({ target: 100, easing: nextEasing });
    act(() => vi.advanceTimersByTime(16));
    expect(result.current).toBe(75);

    act(() => vi.advanceTimersByTime(200));
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
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
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
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const matchMediaSpy = vi.fn(mockMM.mockMatchMedia);
    vi.stubGlobal('matchMedia', matchMediaSpy);
    vi.resetModules();
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
    expect(matchMediaSpy).not.toHaveBeenCalled();
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(0);
  });

  it('completes an active tween when reduced motion turns on', async () => {
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) =>
        useTween({ target, duration: 300, reducedMotion: 'complete' }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(1);

    act(() => mockMM.setMatches(REDUCED_MOTION_QUERY, true));
    expect(result.current).toBe(100);
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(0);
  });

  it('animates when matchMedia is unavailable', async () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.resetModules();
    const useTween = await getHook();
    const { result, rerender } = renderHook(
      ({ target }: { target: number }) => useTween({ target, duration: 300 }),
      { initialProps: { target: 0 } },
    );

    expect(() => rerender({ target: 100 })).not.toThrow();
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
  });

  it('removes the reduced-motion listener on completion and unmount', async () => {
    const useTween = await getHook();
    const { rerender, unmount } = renderHook(
      ({ target }: { target: number }) => useTween({ target, duration: 100 }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(1);
    act(() => vi.advanceTimersByTime(200));
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(0);

    rerender({ target: 200 });
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(1);
    unmount();
    expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(0);
  });

  it.each(['interrupt', 'disable'] as const)(
    'cleans up the active reduced-motion listener on %s',
    async (cleanup) => {
      const useTween = await getHook();
      const { result, rerender } = renderHook(
        ({ target, enabled }: { target: number; enabled: boolean }) =>
          useTween({ target, enabled, duration: 300 }),
        { initialProps: { target: 0, enabled: true } },
      );

      rerender({ target: 100, enabled: true });
      expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(1);

      if (cleanup === 'interrupt') {
        rerender({ target: 200, enabled: true });
        expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(1);
        act(() => mockMM.setMatches(REDUCED_MOTION_QUERY, true));
        expect(result.current).toBe(200);
      } else {
        rerender({ target: 100, enabled: false });
        expect(result.current).toBe(100);
        expect(mockMM.getListenerCount(REDUCED_MOTION_QUERY)).toBe(0);
      }
    },
  );

  it.each(['complete', 'unmount'] as const)(
    'cancels rAF ID zero and ignores a pending callback after %s',
    async (cleanup) => {
      let pendingCallback: FrameRequestCallback | undefined;
      const requestSpy = vi
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          pendingCallback = callback;
          return 0;
        });
      const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
      const easing = vi.fn((progress: number) => progress);
      const useTween = await getHook();
      const { result, rerender, unmount } = renderHook(
        ({ target }: { target: number }) =>
          useTween({ target, duration: 300, easing }),
        { initialProps: { target: 0 } },
      );

      rerender({ target: 100 });
      const callback = pendingCallback;
      expect(callback).toBeDefined();

      if (cleanup === 'complete') {
        act(() => mockMM.setMatches(REDUCED_MOTION_QUERY, true));
        expect(result.current).toBe(100);
      } else {
        unmount();
      }

      expect(cancelSpy).toHaveBeenCalledWith(0);
      const easingCalls = easing.mock.calls.length;
      act(() => callback?.(16));
      expect(easing).toHaveBeenCalledTimes(easingCalls);
      expect(requestSpy).toHaveBeenCalledTimes(1);
    },
  );
});
