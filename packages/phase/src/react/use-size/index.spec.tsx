// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
import { render, renderHook, act } from '@testing-library/react';
import { useRef } from 'react';

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
    expect(mockRO.instances.some((instance) => instance.observed.has(el))).toBe(
      true,
    );

    unmount();
    expect(mockRO.instances.some((instance) => instance.observed.has(el))).toBe(
      false,
    );
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

  it('observes an element mounted after the initial commit', async () => {
    const useSize = await getHook();

    function Probe({ show }: { show: boolean }) {
      const { ref, size } = useSize();
      return (
        <>
          <output data-testid="size">
            {size ? `${size.width}x${size.height}` : 'null'}
          </output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show={false} />);
    expect(view.getByTestId('size').textContent).toBe('null');

    view.rerender(<Probe show />);
    const element = view.getByTestId('target');
    expect(mockRO.instances).toHaveLength(1);
    expect(mockRO.instances[0]?.observed).toContain(element);

    act(() => mockRO.trigger(element, 240, 120));
    expect(view.getByTestId('size').textContent).toBe('240x120');
  });

  it('moves observation to a keyed replacement element', async () => {
    const useSize = await getHook();

    function Probe({ elementKey }: { elementKey: string }) {
      const ref = useRef<HTMLDivElement>(null);
      const { size } = useSize({ ref });
      return (
        <>
          <output data-testid="size">
            {size ? `${size.width}x${size.height}` : 'null'}
          </output>
          <div key={elementKey} ref={ref} data-testid="target" />
        </>
      );
    }

    const view = render(<Probe elementKey="first" />);
    const first = view.getByTestId('target');
    act(() => mockRO.trigger(first, 120, 60));

    view.rerender(<Probe elementKey="second" />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    expect(mockRO.instances[0]?.observed).not.toContain(first);
    expect(mockRO.instances[0]?.observed).toContain(second);

    act(() => mockRO.trigger(second, 300, 150));
    expect(view.getByTestId('size').textContent).toBe('300x150');
  });

  it('keeps the last size while detached and observes the replacement', async () => {
    const useSize = await getHook();

    function Probe({ show }: { show: boolean }) {
      const { ref, size } = useSize();
      return (
        <>
          <output data-testid="size">
            {size ? `${size.width}x${size.height}` : 'null'}
          </output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show />);
    const first = view.getByTestId('target');
    act(() => mockRO.trigger(first, 160, 80));

    view.rerender(<Probe show={false} />);
    expect(view.getByTestId('size').textContent).toBe('160x80');
    expect(mockRO.instances[0]?.observed).not.toContain(first);

    view.rerender(<Probe show />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    expect(mockRO.instances[0]?.observed).toContain(second);

    act(() => mockRO.trigger(second, 320, 160));
    expect(view.getByTestId('size').textContent).toBe('320x160');
  });

  it('delivers the first size from a replacement with matching dimensions', async () => {
    const useSize = await getHook();
    const onResize = vi.fn();

    function Probe({ elementKey }: { elementKey: string }) {
      const { ref } = useSize({ onResize });
      return <div key={elementKey} ref={ref} data-testid="target" />;
    }

    const view = render(<Probe elementKey="first" />);
    const first = view.getByTestId('target');
    act(() => mockRO.trigger(first, 200, 100));

    view.rerender(<Probe elementKey="second" />);
    const second = view.getByTestId('target');
    act(() => mockRO.trigger(second, 200, 100));
    act(() => mockRO.trigger(second, 200, 100));

    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenLastCalledWith({ width: 200, height: 100 });
  });

  it('ignores a notification from an element no longer held by the ref', async () => {
    const useSize = await getHook();
    const first = document.createElement('div');
    const second = document.createElement('div');
    const ref = { current: first as HTMLDivElement | null };
    const onResize = vi.fn();
    const { result } = renderHook(() => useSize({ ref, onResize }));

    act(() => mockRO.trigger(first, 200, 100));
    // React updates object refs during commit before passive effects reconcile
    // the subscription.
    ref.current = second;
    act(() => mockRO.trigger(first, 0, 0));

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(result.current.sizeRef.current).toEqual({ width: 200, height: 100 });
  });

  it('adds no mount render and one reconciliation render for a swap', async () => {
    const useSize = await getHook();

    let reactiveRenders = 0;
    function ReactiveProbe() {
      reactiveRenders++;
      const { ref } = useSize();
      return <div ref={ref} data-testid="reactive-target" />;
    }

    const reactive = render(<ReactiveProbe />, { reactStrictMode: false });
    expect(reactiveRenders).toBe(1);
    act(() => mockRO.trigger(reactive.getByTestId('reactive-target'), 100, 50));
    expect(reactiveRenders).toBe(2);
    reactive.unmount();

    let transientRenders = 0;
    function TransientProbe() {
      transientRenders++;
      const { ref } = useSize({ onResize: noop });
      return <div ref={ref} data-testid="transient-target" />;
    }

    const transient = render(<TransientProbe />, { reactStrictMode: false });
    expect(transientRenders).toBe(1);
    act(() =>
      mockRO.trigger(transient.getByTestId('transient-target'), 100, 50),
    );
    expect(transientRenders).toBe(1);
    transient.unmount();

    let swapRenders = 0;
    function SwapProbe({ elementKey }: { elementKey: string }) {
      swapRenders++;
      const { ref } = useSize({ onResize: noop });
      return <div key={elementKey} ref={ref} />;
    }

    const swap = render(<SwapProbe elementKey="first" />, {
      reactStrictMode: false,
    });
    const beforeSwap = swapRenders;
    swap.rerender(<SwapProbe elementKey="second" />);
    expect(swapRenders).toBe(beforeSwap + 2);
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
