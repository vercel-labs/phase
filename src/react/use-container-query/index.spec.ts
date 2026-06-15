import { renderHook, act } from '@testing-library/react';

import { createMockResizeObserver } from '../../tests/mocks';

let mockRO: ReturnType<typeof createMockResizeObserver>;

beforeEach(() => {
  mockRO = createMockResizeObserver();
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useContainerQuery;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useContainerQuery', () => {
  it('returns false initially', async () => {
    const useContainerQuery = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery(ref, { minWidth: 600 }),
    );
    expect(result.current).toBe(false);
  });

  it('returns true when element crosses minWidth threshold', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery(ref, { minWidth: 600 }),
    );

    act(() => mockRO.trigger(el, 800, 400));
    expect(result.current).toBe(true);
  });

  it('does NOT re-render when match result is unchanged', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    let renderCount = 0;
    const { result: _result } = renderHook(() => {
      renderCount++;
      return useContainerQuery(ref, { minWidth: 600 });
    });

    act(() => mockRO.trigger(el, 800, 400));
    const countAfterMatch = renderCount;

    // Size changes but still above 600 — match unchanged
    act(() => mockRO.trigger(el, 900, 400));
    expect(renderCount).toBe(countAfterMatch);
  });

  it('returns false when element shrinks below threshold', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery(ref, { minWidth: 600 }),
    );

    act(() => mockRO.trigger(el, 800, 400));
    expect(result.current).toBe(true);

    act(() => mockRO.trigger(el, 400, 400));
    expect(result.current).toBe(false);
  });

  it('supports multiple breakpoint constraints', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery(ref, { minWidth: 400, minHeight: 300 }),
    );

    // Width ok, height too small
    act(() => mockRO.trigger(el, 500, 200));
    expect(result.current).toBe(false);

    // Both ok
    act(() => mockRO.trigger(el, 500, 400));
    expect(result.current).toBe(true);
  });

  it('cleans up on unmount', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() =>
      useContainerQuery(ref, { minWidth: 600 }),
    );

    unmount();
    expect(() => mockRO.trigger(el, 800, 400)).not.toThrow();
  });

  it('breakpoint prop change re-evaluates immediately', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ bp }: { bp: { minWidth: number } }) => useContainerQuery(ref, bp),
      { initialProps: { bp: { minWidth: 400 } } },
    );

    act(() => mockRO.trigger(el, 600, 400));
    expect(result.current).toBe(true);

    // Change threshold to 800 — 600px element no longer matches
    rerender({ bp: { minWidth: 800 } });
    // The effect re-runs with new breakpoint, RO fires again
    act(() => mockRO.trigger(el, 600, 400));
    expect(result.current).toBe(false);
  });
});
