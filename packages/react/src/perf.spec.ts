import { act, renderHook } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createMockMatchMedia } from '@usephase/testing/match-media';

import { useLoop } from './use-loop';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('useLoop frame-loop rendering', () => {
  it('does not trigger React renders during frame ticks', () => {
    const mockIO = createMockIntersectionObserver();
    const mockMM = createMockMatchMedia();
    vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
    vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });

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

    act(() => mockIO.trigger(el, true));

    expect(result.current.phase).toBe('running');
    const rendersAfterStart = renderCount;
    act(() => {
      for (let i = 0; i < 200; i++) vi.advanceTimersByTime(16);
    });

    expect(tickCount).toBe(200);
    expect(renderCount).toBe(rendersAfterStart);
    expect(rendersAfterStart).toBeGreaterThan(rendersBeforeStart);
    vi.unstubAllGlobals();
  });
});
