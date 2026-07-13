import { renderHook, act } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMutationObserver } from '../../__mocks__/mutation-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMO: ReturnType<typeof createMockMutationObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockMO = createMockMutationObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('MutationObserver', mockMO.MockClass);
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
  return mod.useMutation;
}

// ---------------------------------------------------------------------------
// Ref management
// ---------------------------------------------------------------------------

describe('ref management', () => {
  it('returns a ref when none is provided', async () => {
    const useMutation = await getHook();
    const { result } = renderHook(() =>
      useMutation({
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('accepts an external ref', async () => {
    const useMutation = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );
    expect(result.current.ref).toBe(ref);
  });
});

// ---------------------------------------------------------------------------
// Reactive mode (default)
// ---------------------------------------------------------------------------

describe('reactive mode', () => {
  it('starts with paused/initial state', async () => {
    const useMutation = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('re-renders on phase transition (visibility)', async () => {
    const useMutation = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );

    expect(result.current.phase).toBe('paused');

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('observing');
    expect(result.current.phaseReason).toBe('started');
  });

  it('re-renders when element leaves viewport', async () => {
    const useMutation = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('observing');

    act(() => mockIO.trigger(el, false));
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('sight');
  });

  it('phaseRef is always current alongside state', async () => {
    const useMutation = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );

    act(() => mockIO.trigger(el, true));
    expect(result.current.phaseRef.current).toBe('observing');
    expect(result.current.phaseReasonRef.current).toBe('started');
  });

  it('starts observing immediately with visibility ignore', async () => {
    const useMutation = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
        visibility: 'ignore',
      }),
    );
    expect(result.current.phase).toBe('observing');
  });

  it('resets to initial when enabled is false', async () => {
    const useMutation = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useMutation({
          ref,
          mutation: { childList: true },
          onMutations: vi.fn(),
          enabled,
        }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('initial');
  });
});

// ---------------------------------------------------------------------------
// Transient mode (onPhaseChange provided)
// ---------------------------------------------------------------------------

describe('transient mode', () => {
  it('does not update state when onPhaseChange is provided', async () => {
    const useMutation = await getHook();
    const { ref, el } = createRefWithElement();
    const phaseCb = vi.fn();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
        onPhaseChange: phaseCb,
      }),
    );

    act(() => mockIO.trigger(el, true));

    expect(phaseCb).toHaveBeenCalledWith('observing', 'started');
    // State stays at initial (transient mode skips setState).
    // phaseRef is updated though.
    expect(result.current.phaseRef.current).toBe('observing');
  });

  it('phaseRef is still current in transient mode', async () => {
    const useMutation = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
        onPhaseChange: vi.fn(),
      }),
    );

    act(() => mockIO.trigger(el, true));
    expect(result.current.phaseRef.current).toBe('observing');
  });
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

describe('teardown', () => {
  it('tears down on unmount without error', async () => {
    const useMutation = await getHook();
    const { ref } = createRefWithElement();
    const { unmount } = renderHook(() =>
      useMutation({
        ref,
        mutation: { childList: true },
        onMutations: vi.fn(),
      }),
    );
    expect(() => unmount()).not.toThrow();
  });

  it('onMutations identity change does not restart observer', async () => {
    const useMutation = await getHook();
    const { ref } = createRefWithElement();
    const { rerender } = renderHook(
      ({ cb }) =>
        useMutation({
          ref,
          mutation: { childList: true },
          onMutations: cb,
        }),
      { initialProps: { cb: vi.fn() } },
    );

    const instanceCount = mockMO.instances.length;
    rerender({ cb: vi.fn() });
    expect(mockMO.instances.length).toBe(instanceCount);
  });
});
