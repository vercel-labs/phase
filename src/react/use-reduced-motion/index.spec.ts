import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../__mocks__/match-media';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.usePrefersReducedMotion;
}

describe('usePrefersReducedMotion', () => {
  it('returns false on initial render (hydration-safe)', async () => {
    const usePrefersReducedMotion = await getHook();
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when reduced motion is active', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePrefersReducedMotion = await getHook();
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('reacts to preference changes', async () => {
    const usePrefersReducedMotion = await getHook();
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => mockMM.setMatches(REDUCED_MOTION_QUERY, true));
    expect(result.current).toBe(true);

    act(() => mockMM.setMatches(REDUCED_MOTION_QUERY, false));
    expect(result.current).toBe(false);
  });
});
