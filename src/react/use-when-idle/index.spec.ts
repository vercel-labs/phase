import { renderHook, act } from '@testing-library/react';

import { createMockIdle } from '../../__mocks__/idle';

let mockIdle: ReturnType<typeof createMockIdle>;

beforeEach(() => {
  mockIdle = createMockIdle();
  vi.stubGlobal('requestIdleCallback', mockIdle.requestIdleCallback);
  vi.stubGlobal('cancelIdleCallback', mockIdle.cancelIdleCallback);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('useWhenIdle', () => {
  it('runs the callback once the browser is idle', async () => {
    const { useWhenIdle } = await import('.');
    const cb = vi.fn();
    renderHook(() => useWhenIdle(cb));

    expect(cb).not.toHaveBeenCalled();

    act(() => mockIdle.flush());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not run before idle', async () => {
    const { useWhenIdle } = await import('.');
    const cb = vi.fn();
    renderHook(() => useWhenIdle(cb));

    expect(cb).not.toHaveBeenCalled();
    expect(mockIdle.pending).toBe(1);
  });

  it('calls the latest callback without re-subscribing', async () => {
    const { useWhenIdle } = await import('.');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useWhenIdle(cb), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => mockIdle.flush());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    // Only one scheduling happened despite the rerender.
    expect(mockIdle.pending).toBe(0);
  });

  it('forwards the timeout option', async () => {
    const spy = vi.spyOn(window, 'requestIdleCallback');
    const { useWhenIdle } = await import('.');

    renderHook(() => useWhenIdle(vi.fn(), { timeout: 2000 }));

    expect(spy).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
  });

  it('cancels on unmount before the callback runs', async () => {
    const { useWhenIdle } = await import('.');
    const cb = vi.fn();
    const { unmount } = renderHook(() => useWhenIdle(cb));

    unmount();
    act(() => mockIdle.flush());

    expect(cb).not.toHaveBeenCalled();
    expect(mockIdle.pending).toBe(0);
  });
});
