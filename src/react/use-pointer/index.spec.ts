import { renderHook } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    setTimeout(() => cb(performance.now()), 0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

async function getHook() {
  const mod = await import('.');
  return mod.usePointer;
}

describe('usePointer', () => {
  it('returns a ref when none is provided', async () => {
    const usePointer = await getHook();
    const { result } = renderHook(() => usePointer({ onPointer: vi.fn() }));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('accepts an external ref', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn() }),
    );
    expect(result.current.ref).toBe(ref);
  });

  it('tears down on unmount', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { unmount } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn() }),
    );
    expect(() => unmount()).not.toThrow();
  });

  it('does not track when enabled is false', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), enabled: false }),
    );
    expect(result.current.phase).toBe('idle');
  });

  it('does not track when ref.current is null', async () => {
    const usePointer = await getHook();
    const ref = { current: null };
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn() }),
    );
    expect(result.current.phase).toBe('idle');
  });
});
