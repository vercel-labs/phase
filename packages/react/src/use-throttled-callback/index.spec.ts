import { renderHook, act } from '@testing-library/react';

let rafCallbacks: Array<FrameRequestCallback>;
let now: number;

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);

  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });

  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks[id - 1] = () => undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Advance the clock and run one frame's worth of queued rAF callbacks. */
function frame(deltaMs = 16): void {
  now += deltaMs;
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) cb(now);
}

async function getHook() {
  const mod = await import('.');
  return mod.useThrottledCallback;
}

describe('useThrottledCallback', () => {
  it('returns a stable identity across re-renders', async () => {
    const useThrottledCallback = await getHook();
    const { result, rerender } = renderHook(() =>
      useThrottledCallback(vi.fn(), { interval: 50 }),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('fires leading synchronously and trailing with the latest value', async () => {
    const useThrottledCallback = await getHook();
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useThrottledCallback<number>(cb, { interval: 50 }),
    );

    act(() => {
      result.current(1);
      result.current(2);
      result.current(3);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);

    act(() => {
      frame(60);
    });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(3);
  });

  it('callback identity change does not restart the throttle', async () => {
    const useThrottledCallback = await getHook();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }) => useThrottledCallback<number>(cb, { interval: 50 }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });
    act(() => {
      result.current(1);
    });

    expect(second).toHaveBeenCalledWith(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('flush fires the pending call, cancel discards it', async () => {
    const useThrottledCallback = await getHook();
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useThrottledCallback<number>(cb, { interval: 50 }),
    );

    act(() => {
      result.current(1);
      result.current(2);
      result.current.flush();
    });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(2);

    act(() => {
      result.current(3);
      result.current.cancel();
      frame(60);
    });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('unmount discards a pending trailing call', async () => {
    const useThrottledCallback = await getHook();
    const cb = vi.fn();
    const { result, unmount } = renderHook(() =>
      useThrottledCallback<number>(cb, { interval: 50 }),
    );

    act(() => {
      result.current(1);
      result.current(2);
    });
    expect(cb).toHaveBeenCalledTimes(1);

    unmount();
    frame(60);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('changing interval recreates the throttle and drops pending work', async () => {
    const useThrottledCallback = await getHook();
    const cb = vi.fn();
    const { result, rerender } = renderHook(
      ({ interval }) => useThrottledCallback<number>(cb, { interval }),
      { initialProps: { interval: 50 } },
    );

    act(() => {
      result.current(1);
      result.current(2);
    });
    rerender({ interval: 100 });
    act(() => {
      frame(120);
    });
    expect(cb).toHaveBeenCalledTimes(1);

    // The new instance is live: a fresh call fires leading.
    act(() => {
      result.current(3);
    });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(3);
  });
});
