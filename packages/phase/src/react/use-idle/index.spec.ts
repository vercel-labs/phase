// Native idle scheduling coverage lives in index.browser.spec.ts. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
import { renderHook } from '@testing-library/react';

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
