import { renderHook, act } from '@testing-library/react';

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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useSight;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useSight', () => {
  it('returns unknown/initial initially', async () => {
    const useSight = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useSight({ ref }));
    expect(result.current.phase).toBe('unknown');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('returns a ref when none is provided', async () => {
    const useSight = await getHook();
    const { result } = renderHook(() => useSight());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('updates when IO triggers visible', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight({ ref }));

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('visible');
  });

  it('updates when IO triggers hidden', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight({ ref }));

    act(() => mockIO.trigger(el, true));
    act(() => mockIO.trigger(el, false));
    expect(result.current.phase).toBe('hidden');
  });

  it('observe: once freezes at visible after first intersection', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight({ ref, observe: 'once' }));

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('visible');

    // Should stay visible even if IO fires false
    act(() => mockIO.trigger(el, false));
    expect(result.current.phase).toBe('visible');
  });

  it('returns unknown when ref is null', async () => {
    const useSight = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() => useSight({ ref: nullRef }));
    expect(result.current.phase).toBe('unknown');
  });

  it('cleans up sight on unmount', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useSight({ ref }));

    unmount();
    // IO trigger after unmount should not throw
    expect(() => mockIO.trigger(el, true)).not.toThrow();
  });

  it('changing observe mode disposes old sight and creates new', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ observe }: { observe: 'continuous' | 'once' }) =>
        useSight({ ref, observe }),
      { initialProps: { observe: 'continuous' as 'continuous' | 'once' } },
    );

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('visible');

    // Switch to 'once' — should create a new sight
    rerender({ observe: 'once' });

    // New sight starts at unknown until IO fires again
    // (the old one was disposed, new one hasn't received IO yet)
    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('visible');
  });

  it('always returns phaseRef and phaseReasonRef', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight({ ref }));

    expect(result.current.phaseRef.current).toBe('unknown');
    expect(result.current.phaseReasonRef.current).toBe('initial');

    act(() => mockIO.trigger(el, true));
    expect(result.current.phaseRef.current).toBe('visible');
  });
});

describe('useSight with onVisibilityChange (transient mode)', () => {
  it('calls onVisibilityChange instead of triggering re-render', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const onVisibilityChange = vi.fn();

    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useSight({ ref, onVisibilityChange });
    });

    const countAfterMount = renderCount;

    act(() => mockIO.trigger(el, true));

    expect(onVisibilityChange).toHaveBeenCalledWith('visible', 'viewport');
    expect(renderCount).toBe(countAfterMount);
  });

  it('updates phaseRef and phaseReasonRef in transient mode', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useSight({ ref, onVisibilityChange: vi.fn() }),
    );

    act(() => mockIO.trigger(el, true));
    expect(result.current.phaseRef.current).toBe('visible');
    expect(result.current.phaseReasonRef.current).toBe('viewport');
  });

  it('omits phase/phaseReason from return type when onVisibilityChange is provided', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const result = renderHook(() =>
      useSight({ ref, onVisibilityChange: vi.fn() }),
    ).result;

    act(() => mockIO.trigger(el, true));

    expect(result.current.phaseRef.current).toBe('visible');
    // @ts-expect-error — phase is not in the transient return type
    expect(result.current.phase).toBe('unknown');
    // @ts-expect-error — phaseReason is not in the transient return type
    expect(result.current.phaseReason).toBe('initial');
  });

  it('calls the latest onVisibilityChange when callback changes', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useSight({ ref, onVisibilityChange: cb }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });

    act(() => mockIO.trigger(el, true));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('visible', 'viewport');
  });

  it('observe: once still works in transient mode', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const onVisibilityChange = vi.fn();

    renderHook(() => useSight({ ref, observe: 'once', onVisibilityChange }));

    act(() => mockIO.trigger(el, true));
    expect(onVisibilityChange).toHaveBeenCalledWith('visible', 'viewport');

    act(() => mockIO.trigger(el, false));
    expect(onVisibilityChange).toHaveBeenCalledTimes(1);
  });
});
