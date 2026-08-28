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
    const { result } = renderHook(() => useSize({ ref }));
    expect(result.current.size).toBeNull();
  });

  it('returns a ref when none is provided', async () => {
    const useSize = await getHook();
    const { result } = renderHook(() => useSize());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('does NOT re-render when dimensions are unchanged', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useSize({ ref });
    });

    act(() => mockRO.trigger(el, 200, 100));
    const countAfterFirst = renderCount;

    act(() => mockRO.trigger(el, 200, 100));
    expect(renderCount).toBe(countAfterFirst);
  });

  it('returns null when ref is null', async () => {
    const useSize = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() => useSize({ ref: nullRef }));
    expect(result.current.size).toBeNull();
  });

  it('cleans up on unmount', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useSize({ ref }));

    unmount();
    expect(() => mockRO.trigger(el, 100, 50)).not.toThrow();
  });

  it('rapid resize reflects the last value', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize({ ref }));

    act(() => {
      mockRO.trigger(el, 100, 50);
      mockRO.trigger(el, 200, 100);
      mockRO.trigger(el, 300, 150);
    });

    expect(result.current.size).toEqual({ width: 300, height: 150 });
  });

  it('returns border-box dimensions when box is "border-box"', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize({ ref, box: 'border-box' }));

    act(() => mockRO.triggerWithBorderBox(el, 200, 100, 240, 120));
    expect(result.current.size).toEqual({ width: 240, height: 120 });
  });

  it('returns content-box dimensions by default when border differs', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize({ ref }));

    act(() => mockRO.triggerWithBorderBox(el, 200, 100, 240, 120));
    expect(result.current.size).toEqual({ width: 200, height: 100 });
  });

  it('re-observes when box option changes at runtime', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ box }: { box?: 'content-box' | 'border-box' }) =>
        useSize({ ref, box }),
      {
        initialProps: {
          box: undefined as 'content-box' | 'border-box' | undefined,
        },
      },
    );

    act(() => mockRO.triggerWithBorderBox(el, 200, 100, 240, 120));
    expect(result.current.size).toEqual({ width: 200, height: 100 });

    rerender({ box: 'border-box' });
    act(() => mockRO.triggerWithBorderBox(el, 200, 100, 240, 120));
    expect(result.current.size).toEqual({ width: 240, height: 120 });
  });

  it('deduplicates border-box renders on unchanged dimensions', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useSize({ ref, box: 'border-box' });
    });

    act(() => mockRO.triggerWithBorderBox(el, 200, 100, 240, 120));
    const countAfterFirst = renderCount;

    act(() => mockRO.triggerWithBorderBox(el, 200, 100, 240, 120));
    expect(renderCount).toBe(countAfterFirst);
  });

  it('always returns sizeRef', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize({ ref }));

    expect(result.current.sizeRef.current).toBeNull();

    act(() => mockRO.trigger(el, 200, 100));
    expect(result.current.sizeRef.current).toEqual({ width: 200, height: 100 });
  });

  it('sizeRef updates even without onResize', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize({ ref }));

    act(() => mockRO.trigger(el, 400, 300));
    expect(result.current.sizeRef.current).toEqual({ width: 400, height: 300 });
    expect(result.current.size).toEqual({ width: 400, height: 300 });
  });
});

const noop = vi.fn();

describe('useSize with onResize (transient mode)', () => {
  it('calls onResize instead of triggering re-render', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const onResize = vi.fn();

    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useSize({ ref, onResize });
    });

    const countAfterMount = renderCount;

    act(() => mockRO.trigger(el, 200, 100));

    expect(onResize).toHaveBeenCalledWith({ width: 200, height: 100 });
    expect(renderCount).toBe(countAfterMount);
  });

  it('updates sizeRef in transient mode', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSize({ ref, onResize: noop }));

    act(() => mockRO.trigger(el, 200, 100));
    expect(result.current.sizeRef.current).toEqual({ width: 200, height: 100 });
  });

  it('dedupes unchanged dimensions in transient mode', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const onResize = vi.fn();
    renderHook(() => useSize({ ref, onResize }));

    act(() => mockRO.trigger(el, 200, 100));
    act(() => mockRO.trigger(el, 200, 100));

    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('calls the latest onResize when callback changes', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useSize({ ref, onResize: cb }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });

    act(() => mockRO.trigger(el, 300, 150));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ width: 300, height: 150 });
  });

  it('omits size from return type when onResize is provided', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const result = renderHook(() => useSize({ ref, onResize: vi.fn() })).result;

    act(() => mockRO.trigger(el, 200, 100));

    expect(result.current.sizeRef.current).toEqual({ width: 200, height: 100 });
    // @ts-expect-error — size is not in the transient return type
    expect(result.current.size).toBeNull();
  });

  it('rapid resize in transient mode calls onResize for each change', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();
    const onResize = vi.fn();
    renderHook(() => useSize({ ref, onResize }));

    act(() => {
      mockRO.trigger(el, 100, 50);
      mockRO.trigger(el, 200, 100);
      mockRO.trigger(el, 300, 150);
    });

    expect(onResize).toHaveBeenCalledTimes(3);
    expect(onResize).toHaveBeenLastCalledWith({ width: 300, height: 150 });
  });
});

describe('shared element', () => {
  it('two hooks observing one element both receive sizes', async () => {
    // Two components measuring the same node through a shared ref is ordinary
    // composition; the pool must not let the later one silence the earlier.
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();

    const first = renderHook(() => useSize({ ref }));
    const second = renderHook(() => useSize({ ref }));

    act(() => {
      mockRO.trigger(el, 320, 240);
    });

    expect(first.result.current.size).toEqual({ width: 320, height: 240 });
    expect(second.result.current.size).toEqual({ width: 320, height: 240 });
  });

  it('unmounting one hook leaves the other observing', async () => {
    const useSize = await getHook();
    const { ref, el } = createRefWithElement();

    const first = renderHook(() => useSize({ ref }));
    const second = renderHook(() => useSize({ ref }));

    second.unmount();

    act(() => {
      mockRO.trigger(el, 500, 400);
    });

    expect(first.result.current.size).toEqual({ width: 500, height: 400 });
  });
});
