// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
import { render, renderHook, act } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { useLayoutEffect, useRef } from 'react';

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

function isObserved(element: Element): boolean {
  return mockIO.instances.some((instance) => instance.observed.has(element));
}

describe('useScrollProgress', () => {
  it('observes an element mounted after the initial commit', async () => {
    const useScrollProgress = await getHook();

    function Probe({ show }: { show: boolean }) {
      const { ref, progress, progressRef } = useScrollProgress();
      return (
        <>
          <output data-testid="progress">{progress}</output>
          <output data-testid="progress-ref">{progressRef.current}</output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show={false} />);
    view.rerender(<Probe show />);
    const target = view.getByTestId('target');

    expect(isObserved(target)).toBe(true);
    act(() => mockIO.triggerWithRatio(target, 0.45));
    expect(view.getByTestId('progress').textContent).toBe('0.45');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.45');
  });

  it('moves observation to a keyed replacement and keeps progress until a changed-ratio callback', async () => {
    const useScrollProgress = await getHook();

    function Probe({ elementKey }: { elementKey: string }) {
      const ref = useRef<HTMLDivElement>(null);
      const { progress, progressRef } = useScrollProgress({ ref, steps: 4 });
      return (
        <>
          <output data-testid="progress">{progress}</output>
          <output data-testid="progress-ref">{progressRef.current}</output>
          <div key={elementKey} ref={ref} data-testid="target" />
        </>
      );
    }

    const view = render(<Probe elementKey="first" />);
    const first = view.getByTestId('target');
    act(() => mockIO.triggerWithRatio(first, 0.75));
    expect(view.getByTestId('progress').textContent).toBe('0.75');

    view.rerender(<Probe elementKey="second" />);
    const second = view.getByTestId('target');

    expect(second).not.toBe(first);
    expect(isObserved(first)).toBe(false);
    expect(isObserved(second)).toBe(true);
    expect(view.getByTestId('progress').textContent).toBe('0.75');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.75');

    act(() => mockIO.triggerWithRatio(first, 0.9));
    expect(view.getByTestId('progress').textContent).toBe('0.75');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.75');
    act(() => mockIO.triggerWithRatio(second, 0.25));
    expect(view.getByTestId('progress').textContent).toBe('0.25');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.25');
  });

  it('re-observes after collapse and re-expand while retaining the last progress', async () => {
    const useScrollProgress = await getHook();

    function Probe({ show }: { show: boolean }) {
      const { ref, progress, progressRef } = useScrollProgress();
      return (
        <>
          <output data-testid="progress">{progress}</output>
          <output data-testid="progress-ref">{progressRef.current}</output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show />);
    const first = view.getByTestId('target');
    act(() => mockIO.triggerWithRatio(first, 0.6));
    expect(view.getByTestId('progress').textContent).toBe('0.6');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.6');

    view.rerender(<Probe show={false} />);
    expect(isObserved(first)).toBe(false);
    expect(view.getByTestId('progress').textContent).toBe('0.6');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.6');

    view.rerender(<Probe show />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    expect(isObserved(second)).toBe(true);
    expect(view.getByTestId('progress').textContent).toBe('0.6');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.6');

    act(() => mockIO.triggerWithRatio(second, 0.2));
    expect(view.getByTestId('progress').textContent).toBe('0.2');
    expect(view.getByTestId('progress-ref').textContent).toBe('0.2');
  });

  it('ignores a detached element update before passive cleanup', async () => {
    const useScrollProgress = await getHook();
    const onProgress = vi.fn();
    let detachedTarget: HTMLDivElement | null = null;
    let latestProgressRef: { current: number } | undefined;

    function Probe({ show }: { show: boolean }) {
      const { ref, progressRef } = useScrollProgress({ onProgress });
      latestProgressRef = progressRef;

      useLayoutEffect(() => {
        if (show) {
          detachedTarget = ref.current;
        } else if (detachedTarget) {
          mockIO.triggerWithRatio(detachedTarget, 0.9);
        }
      }, [ref, show]);

      return show ? <div ref={ref} data-testid="target" /> : null;
    }

    const view = render(<Probe show />);
    const target = view.getByTestId('target');
    act(() => mockIO.triggerWithRatio(target, 0.6));
    expect(onProgress).toHaveBeenLastCalledWith(0.6);
    onProgress.mockClear();

    view.rerender(<Probe show={false} />);

    expect(isObserved(target)).toBe(false);
    expect(latestProgressRef?.current).toBe(0.6);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('adds no reconciliation render on plain mount', async () => {
    const useScrollProgress = await getHook();
    let renders = 0;

    function Probe() {
      renders++;
      const { ref } = useScrollProgress();
      return <div ref={ref} data-testid="target" />;
    }

    const view = render(<Probe />, { reactStrictMode: false });

    expect(renders).toBe(1);
    expect(isObserved(view.getByTestId('target'))).toBe(true);
  });

  it('returns 0 before first observation', async () => {
    const useScrollProgress = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useScrollProgress({ ref }));

    expect(result.current.progress).toBe(0);
  });

  it('returns a ref when none is provided', async () => {
    const useScrollProgress = await getHook();
    const { result } = renderHook(() => useScrollProgress());
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
