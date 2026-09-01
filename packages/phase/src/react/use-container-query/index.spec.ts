// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
import { renderHook, act } from '@testing-library/react';

import { createMockResizeObserver } from '../../__mocks__/resize-observer';

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
      useContainerQuery({ minWidth: 600 }, { ref }),
    );
    expect(result.current.matches).toBe(false);
  });

  it('returns a ref when none is provided', async () => {
    const useContainerQuery = await getHook();
    const { result } = renderHook(() => useContainerQuery({ minWidth: 600 }));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('does NOT re-render when match result is unchanged', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useContainerQuery({ minWidth: 600 }, { ref });
    });

    act(() => mockRO.trigger(el, 800, 400));
    const countAfterMatch = renderCount;

    // Size changes but still above 600 — match unchanged
    act(() => mockRO.trigger(el, 900, 400));
    expect(renderCount).toBe(countAfterMatch);
  });

  it('supports multiple breakpoint constraints', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery({ minWidth: 400, minHeight: 300 }, { ref }),
    );

    // Width ok, height too small
    act(() => mockRO.trigger(el, 500, 200));
    expect(result.current.matches).toBe(false);

    // Both ok
    act(() => mockRO.trigger(el, 500, 400));
    expect(result.current.matches).toBe(true);
  });

  it('cleans up on unmount', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() =>
      useContainerQuery({ minWidth: 600 }, { ref }),
    );
    expect(mockRO.instances.some((instance) => instance.observed.has(el))).toBe(
      true,
    );

    unmount();
    expect(mockRO.instances.some((instance) => instance.observed.has(el))).toBe(
      false,
    );
  });

  it('breakpoint prop change re-evaluates immediately', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ bp }: { bp: { minWidth: number } }) => useContainerQuery(bp, { ref }),
      { initialProps: { bp: { minWidth: 400 } } },
    );

    act(() => mockRO.trigger(el, 600, 400));
    expect(result.current.matches).toBe(true);

    // Change threshold to 800 — 600px element no longer matches
    rerender({ bp: { minWidth: 800 } });
    // The effect re-runs with new breakpoint, RO fires again
    act(() => mockRO.trigger(el, 600, 400));
    expect(result.current.matches).toBe(false);
  });
});
