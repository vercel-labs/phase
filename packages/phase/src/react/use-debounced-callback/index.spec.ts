import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useDebouncedCallback;
}

describe('useDebouncedCallback', () => {
  it('returns a stable identity across re-renders', async () => {
    const useDebouncedCallback = await getHook();
    const { result, rerender } = renderHook(() =>
      useDebouncedCallback(vi.fn(), { wait: 200 }),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('fires once after the quiet period with the latest value', async () => {
    const useDebouncedCallback = await getHook();
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback<number>(cb, { wait: 200 }),
    );

    act(() => {
      result.current(1);
      result.current(2);
    });
    expect(cb).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2);
  });

  it('callback identity change does not restart the debounce', async () => {
    const useDebouncedCallback = await getHook();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback<number>(cb, { wait: 200 }),
      { initialProps: { cb: first } },
    );

    act(() => {
      result.current(1);
    });
    rerender({ cb: second });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(second).toHaveBeenCalledWith(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('flush fires the pending call, cancel discards it', async () => {
    const useDebouncedCallback = await getHook();
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback<number>(cb, { wait: 200 }),
    );

    act(() => {
      result.current(1);
      result.current.flush();
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);

    act(() => {
      result.current(2);
      result.current.cancel();
      vi.advanceTimersByTime(200);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unmount discards a pending call', async () => {
    const useDebouncedCallback = await getHook();
    const cb = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback<number>(cb, { wait: 200 }),
    );

    act(() => {
      result.current(1);
    });
    unmount();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });

  it('changing wait recreates the debounce and drops pending work', async () => {
    const useDebouncedCallback = await getHook();
    const cb = vi.fn();
    const { result, rerender } = renderHook(
      ({ wait }) => useDebouncedCallback<number>(cb, { wait }),
      { initialProps: { wait: 200 } },
    );

    act(() => {
      result.current(1);
    });
    rerender({ wait: 500 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(cb).not.toHaveBeenCalled();

    // The new instance is live.
    act(() => {
      result.current(2);
      vi.advanceTimersByTime(500);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2);
  });
});
