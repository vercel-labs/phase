import { renderHook, act } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useLifecycle;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useLifecycle', () => {
  it('returns a ref when none is provided', async () => {
    const useLifecycle = await getHook();
    const { result } = renderHook(() => useLifecycle());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
    expect(result.current.isActive).toBe(false);
  });

  it('activates when the element becomes visible', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useLifecycle({ ref }));

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('active');
    expect(result.current.isActive).toBe(true);
  });

  it('pauses when the element leaves the viewport', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useLifecycle({ ref }));

    act(() => mockIO.trigger(el, true));
    act(() => mockIO.trigger(el, false));
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('sight');
    expect(result.current.isActive).toBe(false);
  });

  it('pauses on reduced motion by default', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useLifecycle({ ref }));

    act(() => mockIO.trigger(el, true));
    act(() => mockMM.setMatches('(prefers-reduced-motion: reduce)', true));
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('reduced-motion');
  });

  it('paused prop manually pauses and resumes', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) => useLifecycle({ ref, paused }),
      { initialProps: { paused: false } },
    );

    act(() => mockIO.trigger(el, true));
    expect(result.current.isActive).toBe(true);

    rerender({ paused: true });
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('manual');

    rerender({ paused: false });
    expect(result.current.isActive).toBe(true);
  });

  it('enabled=false stays idle', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useLifecycle({ ref, enabled: false }));

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('idle');
    expect(result.current.isActive).toBe(false);
  });

  it('cleans up on unmount', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useLifecycle({ ref }));

    unmount();
    expect(() => mockIO.trigger(el, true)).not.toThrow();
  });
});
