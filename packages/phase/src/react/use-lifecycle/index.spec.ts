// Native observer coverage lives in index.browser.spec.ts. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
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
    expect(mockIO.instances.some((instance) => instance.observed.has(el))).toBe(
      true,
    );
    expect(mockMM.listenerCount('(prefers-reduced-motion: reduce)')).toBe(1);

    unmount();
    expect(mockIO.instances.some((instance) => instance.observed.has(el))).toBe(
      false,
    );
    expect(mockMM.listenerCount('(prefers-reduced-motion: reduce)')).toBe(0);
  });

  it('onPhaseChange fires synchronously on phase transitions', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const onPhaseChange = vi.fn();
    renderHook(() => useLifecycle({ ref, onPhaseChange }));

    act(() => mockIO.trigger(el, true));
    expect(onPhaseChange).toHaveBeenCalledWith('active', 'started');

    act(() => mockIO.trigger(el, false));
    expect(onPhaseChange).toHaveBeenCalledWith('paused', 'sight');
  });

  it('onPhaseChange picks up latest callback without re-creating lifecycle', async () => {
    const useLifecycle = await getHook();
    const { ref, el } = createRefWithElement();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const { rerender } = renderHook(
      ({ onPhaseChange }: { onPhaseChange: typeof cb1 }) =>
        useLifecycle({ ref, onPhaseChange }),
      { initialProps: { onPhaseChange: cb1 } },
    );

    // createLifecycle auto-starts: element not yet visible, so cb1 receives
    // ('paused', 'sight') during construction, then ('active', 'started').
    act(() => mockIO.trigger(el, true));
    expect(cb1).toHaveBeenCalledWith('active', 'started');
    const cb1CallCount = cb1.mock.calls.length;

    // Swap callback without tearing down the lifecycle
    rerender({ onPhaseChange: cb2 });

    act(() => mockIO.trigger(el, false));
    expect(cb2).toHaveBeenCalledWith('paused', 'sight');
    // cb1 should NOT have been called after the swap
    expect(cb1).toHaveBeenCalledTimes(cb1CallCount);
  });
});

describe('page target', () => {
  it('activates on the page with no observer', async () => {
    const useLifecycle = await getHook();

    const { result } = renderHook(() => useLifecycle({ target: 'page' }));

    expect(result.current.phase).toBe('active');
    expect(mockIO.instances).toHaveLength(0);
  });

  it('throws when both ref and target are given', async () => {
    const useLifecycle = await getHook();
    const { ref } = createRefWithElement();

    expect(() =>
      renderHook(() => useLifecycle({ ref, target: 'page' })),
    ).toThrowError(/both ref and target/);
  });
});

describe('page target is SSR-safe', () => {
  it('rejects a Document at the type level and does not activate', async () => {
    const useLifecycle = await getHook();

    const { result } = renderHook(() =>
      // @ts-expect-error - Document is not assignable to target: 'page'
      useLifecycle({ target: document }),
    );

    // A literal `document` in hook options throws during server render, so the
    // option is a string. Passing one anyway must not quietly activate.
    expect(result.current.isActive).toBe(false);
  });
});
