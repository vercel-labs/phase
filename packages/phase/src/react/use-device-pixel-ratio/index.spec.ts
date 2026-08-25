import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  vi.stubGlobal('devicePixelRatio', 2);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useDevicePixelRatio;
}

describe('useDevicePixelRatio', () => {
  it('reads the live DPR after mount', async () => {
    const useDevicePixelRatio = await getHook();
    const { result } = renderHook(() => useDevicePixelRatio());
    expect(result.current).toBe(2);
  });

  it('updates when DPR changes (monitor switch)', async () => {
    const useDevicePixelRatio = await getHook();
    const { result } = renderHook(() => useDevicePixelRatio());
    expect(result.current).toBe(2);

    // Simulate a DPR change: update the global and fire the MQL change event
    act(() => {
      vi.stubGlobal('devicePixelRatio', 3);
      mockMM.setMatches('(resolution: 2dppx)', false);
    });

    expect(result.current).toBe(3);
  });

  it('cleans up subscription on unmount', async () => {
    const useDevicePixelRatio = await getHook();
    const { unmount } = renderHook(() => useDevicePixelRatio());

    unmount();

    // After unmount, triggering a DPR change should not throw
    expect(() => {
      vi.stubGlobal('devicePixelRatio', 1);
      mockMM.setMatches('(resolution: 2dppx)', false);
    }).not.toThrow();
  });
});
