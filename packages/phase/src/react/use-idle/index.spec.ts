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

describe('useIdle', () => {
  it('starts false and flips to true once idle', async () => {
    const { useIdle } = await import('.');
    const { result } = renderHook(() => useIdle());

    expect(result.current).toBe(false);

    act(() => mockIdle.flush());
    expect(result.current).toBe(true);
  });

  it('forwards the timeout option', async () => {
    const spy = vi.spyOn(window, 'requestIdleCallback');
    const { useIdle } = await import('.');

    renderHook(() => useIdle({ timeout: 1500 }));

    expect(spy).toHaveBeenCalledWith(expect.any(Function), { timeout: 1500 });
  });

  it('cancels the idle callback on unmount', async () => {
    const { useIdle } = await import('.');
    const { unmount } = renderHook(() => useIdle());

    unmount();
    expect(mockIdle.pending).toBe(0);
  });
});
