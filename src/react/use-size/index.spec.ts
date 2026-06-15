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
  return mod.useSize;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useSize', () => {
  it('returns null before first observation', async () => {
    const useSize = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useSize(ref));
    expect(result.current).toBeNull();
  });

  it('returns { width, height } after RO triggers', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize(ref));

    act(() => mockRO.trigger(el, 200, 100));
    expect(result.current).toEqual({ width: 200, height: 100 });
  });

  it('does NOT re-render when dimensions are unchanged', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    let renderCount = 0;
    const { result: _result } = renderHook(() => {
      renderCount++;
      return useSize(ref);
    });

    act(() => mockRO.trigger(el, 200, 100));
    const countAfterFirst = renderCount;

    act(() => mockRO.trigger(el, 200, 100));
    expect(renderCount).toBe(countAfterFirst);
  });

  it('updates when dimensions change', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize(ref));

    act(() => mockRO.trigger(el, 200, 100));
    expect(result.current).toEqual({ width: 200, height: 100 });

    act(() => mockRO.trigger(el, 300, 150));
    expect(result.current).toEqual({ width: 300, height: 150 });
  });

  it('returns null when ref is null', async () => {
    const useSize = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() => useSize(nullRef));
    expect(result.current).toBeNull();
  });

  it('cleans up on unmount', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useSize(ref));

    unmount();
    expect(() => mockRO.trigger(el, 100, 50)).not.toThrow();
  });

  it('rapid resize reflects the last value', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize(ref));

    act(() => {
      mockRO.trigger(el, 100, 50);
      mockRO.trigger(el, 200, 100);
      mockRO.trigger(el, 300, 150);
    });

    expect(result.current).toEqual({ width: 300, height: 150 });
  });
});
