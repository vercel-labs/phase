import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../__mocks__/match-media';

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
  return mod.useMediaQuery;
}

describe('useMediaQuery', () => {
  it('returns false on initial render (hydration-safe)', async () => {
    const useMediaQuery = await getHook();
    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'));
    // Before the effect runs, initial state is false
    expect(result.current).toBe(false);
  });

  it('updates to true when MQL matches after mount', async () => {
    mockMM.setMatches('(max-width: 600px)', true);
    const useMediaQuery = await getHook();
    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'));

    // After effect runs with readMediaQuery, should be true
    expect(result.current).toBe(true);
  });

  it('updates when MQL change event fires', async () => {
    const useMediaQuery = await getHook();
    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'));
    expect(result.current).toBe(false);

    act(() => mockMM.setMatches('(max-width: 600px)', true));
    expect(result.current).toBe(true);

    act(() => mockMM.setMatches('(max-width: 600px)', false));
    expect(result.current).toBe(false);
  });

  it('re-subscribes when query string changes', async () => {
    const useMediaQuery = await getHook();
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: '(max-width: 600px)' } },
    );

    mockMM.setMatches('(max-width: 900px)', true);
    rerender({ query: '(max-width: 900px)' });

    expect(result.current).toBe(true);
  });

  it('cleans up subscription on unmount', async () => {
    const useMediaQuery = await getHook();
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 600px)'));

    unmount();

    // After unmount, setting matches should not throw or affect anything
    expect(() => mockMM.setMatches('(max-width: 600px)', true)).not.toThrow();
  });

  it('two instances with same query update independently', async () => {
    const useMediaQuery = await getHook();
    const { result: r1 } = renderHook(() =>
      useMediaQuery('(max-width: 600px)'),
    );
    const { result: r2 } = renderHook(() =>
      useMediaQuery('(max-width: 600px)'),
    );

    expect(r1.current).toBe(false);
    expect(r2.current).toBe(false);

    act(() => mockMM.setMatches('(max-width: 600px)', true));

    expect(r1.current).toBe(true);
    expect(r2.current).toBe(true);
  });
});
