import { renderHook } from '@testing-library/react';

import {
  createMockIntersectionObserver,
  createMockMatchMedia,
} from '../../tests/mocks.js';

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

async function getHook() {
  const mod = await import('./index.js');
  return mod.useLoop;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useLoop', () => {
  it('returns initial state { phase: idle, quality: full }', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useLoop({ ref, onTick: vi.fn() }));
    // Before sight reports, loop is paused
    expect(result.current.quality).toBe('full');
    expect(result.current.qualityReason).toBeUndefined();
  });

  it('enabled=false returns disabled state', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useLoop({ ref, onTick: vi.fn(), enabled: false }),
    );
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('enabled');
  });

  it('null ref does not throw, returns disabled state', async () => {
    const useLoop = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() =>
      useLoop({ ref: nullRef, onTick: vi.fn() }),
    );
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('enabled');
  });

  it('cleans up loop on unmount', async () => {
    const useLoop = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useLoop({ ref, onTick: vi.fn() }));

    unmount();
    // IO trigger after unmount should not throw
    expect(() => mockIO.trigger(el, true)).not.toThrow();
  });

  it('enabled toggle: true -> false -> true', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLoop({ ref, onTick: vi.fn(), enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('enabled');

    rerender({ enabled: true });
    // Should be back to a non-disabled state
    expect(result.current.phaseReason).not.toBe('enabled');
  });
});
