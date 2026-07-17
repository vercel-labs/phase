import { renderHook, act } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';

// jsdom lacks PointerEvent — MouseEvent already carries clientX/clientY.
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as Record<string, unknown>).PointerEvent =
    class PointerEvent extends MouseEvent {};
}

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

// ---------------------------------------------------------------------------
// Ref management
// ---------------------------------------------------------------------------

describe('ref management', () => {
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
});

// ---------------------------------------------------------------------------
// Reactive mode (default)
// ---------------------------------------------------------------------------

describe('reactive mode', () => {
  it('starts idle/initial', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore' }),
    );
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('re-renders to tracking on pointer enter', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore' }),
    );

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
    });
    expect(result.current.phase).toBe('tracking');
    expect(result.current.phaseReason).toBe('enter');
  });

  it('re-renders back to idle on pointer leave', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore' }),
    );

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
    });
    expect(result.current.phase).toBe('tracking');

    act(() => {
      el.dispatchEvent(new Event('pointerleave'));
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('leave');
  });

  it('phaseRef is always current alongside state', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore' }),
    );

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
    });
    expect(result.current.phaseRef.current).toBe('tracking');
    expect(result.current.phaseReasonRef.current).toBe('enter');
  });

  it('does not track until the element is visible (visibility pause)', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn() }),
    );

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
    });
    expect(result.current.phase).toBe('idle');

    act(() => {
      mockIO.trigger(el, true);
      el.dispatchEvent(new Event('pointerenter'));
    });
    expect(result.current.phase).toBe('tracking');
  });

  it('resets to initial when enabled is false', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore', enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
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

// ---------------------------------------------------------------------------
// stateRef
// ---------------------------------------------------------------------------

describe('stateRef', () => {
  it('starts at the default position', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore' }),
    );
    expect(result.current.stateRef.current).toEqual({
      x: 0,
      y: 0,
      active: false,
    });
  });

  it('mirrors the latest pointer position without a re-render', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn(), visibility: 'ignore' }),
    );

    await act(async () => {
      el.dispatchEvent(new Event('pointerenter'));
      el.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 50, clientY: 60 }),
      );
      // rAF is stubbed to a macrotask; let the batched flush run.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.stateRef.current.x).toBe(50);
    expect(result.current.stateRef.current.y).toBe(60);
    expect(result.current.stateRef.current.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Transient mode (onPhaseChange provided)
// ---------------------------------------------------------------------------

describe('transient mode', () => {
  it('does not update state when onPhaseChange is provided', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const phaseCb = vi.fn();
    const { result } = renderHook(() =>
      usePointer({
        ref,
        onPointer: vi.fn(),
        onPhaseChange: phaseCb,
        visibility: 'ignore',
      }),
    );

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
    });

    expect(phaseCb).toHaveBeenCalledWith('tracking', 'enter');
    // phaseRef still updates in transient mode.
    expect(result.current.phaseRef.current).toBe('tracking');
  });

  it('forwards pointer state through onPointer on leave', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const onPointer = vi.fn();
    renderHook(() =>
      usePointer({
        ref,
        onPointer,
        onPhaseChange: vi.fn(),
        visibility: 'ignore',
      }),
    );

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
      el.dispatchEvent(new Event('pointerleave'));
    });

    expect(onPointer).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

describe('teardown', () => {
  it('tears down on unmount without error', async () => {
    const usePointer = await getHook();
    const { ref } = createRefWithElement();
    const { unmount } = renderHook(() =>
      usePointer({ ref, onPointer: vi.fn() }),
    );
    expect(() => unmount()).not.toThrow();
  });

  it('onPointer identity change does not restart the tracker', async () => {
    const usePointer = await getHook();
    const { ref, el } = createRefWithElement();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => usePointer({ ref, onPointer: cb, visibility: 'ignore' }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });

    act(() => {
      el.dispatchEvent(new Event('pointerenter'));
      el.dispatchEvent(new Event('pointerleave'));
    });

    // The latest callback is invoked without restarting the effect.
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
    expect(first).not.toHaveBeenCalled();
  });
});
