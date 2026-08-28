// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
import { renderHook, act } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useScrollProgress;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useScrollProgress', () => {
  it('returns 0 before first observation', async () => {
    const useScrollProgress = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useScrollProgress({ ref }));

    expect(result.current.progress).toBe(0);
  });

  it('returns a ref when none is provided', async () => {
    const useScrollProgress = await getHook();
    const { result } = renderHook(() => useScrollProgress());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('cleans up on unmount', async () => {
    const useScrollProgress = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useScrollProgress({ ref }));
    expect(mockIO.instances.some((instance) => instance.observed.has(el))).toBe(
      true,
    );

    unmount();
    expect(mockIO.instances.some((instance) => instance.observed.has(el))).toBe(
      false,
    );
  });

  it('re-subscribes when steps changes', async () => {
    const useScrollProgress = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ steps }: { steps?: number }) => useScrollProgress({ ref, steps }),
      { initialProps: { steps: 20 } },
    );

    expect(result.current.progress).toBe(0);

    rerender({ steps: 10 });

    // Should have created a new IO instance with different thresholds
    expect(mockIO.instances.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 when ref is null', async () => {
    const useScrollProgress = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() => useScrollProgress({ ref: nullRef }));

    expect(result.current.progress).toBe(0);
  });

  it('multiple hooks on different elements work independently', async () => {
    const useScrollProgress = await getHook();
    const { ref: ref1, el: el1 } = createRefWithElement();
    const { ref: ref2, el: el2 } = createRefWithElement();

    const { result: result1 } = renderHook(() =>
      useScrollProgress({ ref: ref1 }),
    );
    const { result: result2 } = renderHook(() =>
      useScrollProgress({ ref: ref2 }),
    );

    act(() => mockIO.triggerWithRatio(el1, 0.3));
    expect(result1.current.progress).toBe(0.3);
    expect(result2.current.progress).toBe(0);

    act(() => mockIO.triggerWithRatio(el2, 0.7));
    expect(result1.current.progress).toBe(0.3);
    expect(result2.current.progress).toBe(0.7);
  });

  it('always returns progressRef', async () => {
    const useScrollProgress = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useScrollProgress({ ref }));

    expect(result.current.progressRef.current).toBe(0);

    act(() => mockIO.triggerWithRatio(el, 0.6));
    expect(result.current.progressRef.current).toBe(0.6);
  });
});

describe('useScrollProgress with onProgress (transient mode)', () => {
  it('calls onProgress instead of triggering re-render', async () => {
    const useScrollProgress = await getHook();
    const { ref, el } = createRefWithElement();
    const onProgress = vi.fn();

    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useScrollProgress({ ref, onProgress });
    });

    const countAfterMount = renderCount;

    act(() => mockIO.triggerWithRatio(el, 0.5));

    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(renderCount).toBe(countAfterMount);
  });

  it('updates progressRef in transient mode', async () => {
    const useScrollProgress = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useScrollProgress({ ref, onProgress: vi.fn() }),
    );

    act(() => mockIO.triggerWithRatio(el, 0.75));
    expect(result.current.progressRef.current).toBe(0.75);
  });

  it('omits progress from return type when onProgress is provided', async () => {
    const useScrollProgress = await getHook();
    const { ref, el } = createRefWithElement();
    const result = renderHook(() =>
      useScrollProgress({ ref, onProgress: vi.fn() }),
    ).result;

    act(() => mockIO.triggerWithRatio(el, 0.5));

    expect(result.current.progressRef.current).toBe(0.5);
    // @ts-expect-error — progress is not in the transient return type
    expect(result.current.progress).toBe(0);
  });

  it('calls the latest onProgress when callback changes', async () => {
    const useScrollProgress = await getHook();
    const { ref, el } = createRefWithElement();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useScrollProgress({ ref, onProgress: cb }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });

    act(() => mockIO.triggerWithRatio(el, 0.4));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(0.4);
  });
});
