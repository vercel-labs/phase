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
    const { result } = renderHook(() => useSight(ref));
    expect(result.current.phase).toBe('unknown');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('updates when IO triggers visible', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight(ref));

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('visible');
  });

  it('updates when IO triggers hidden', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight(ref));

    act(() => mockIO.trigger(el, true));
    act(() => mockIO.trigger(el, false));
    expect(result.current.phase).toBe('hidden');
  });

  it('observe: once freezes at visible after first intersection', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useSight(ref, { observe: 'once' }));

    act(() => mockIO.trigger(el, true));
    expect(result.current.phase).toBe('visible');

    // Should stay visible even if IO fires false
    act(() => mockIO.trigger(el, false));
    expect(result.current.phase).toBe('visible');
  });

  it('returns unknown when ref is null', async () => {
    const useSight = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() => useSight(nullRef));
    expect(result.current.phase).toBe('unknown');
  });

  it('cleans up sight on unmount', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useSight(ref));

    unmount();
    // IO trigger after unmount should not throw
    expect(() => mockIO.trigger(el, true)).not.toThrow();
  });

  it('changing observe mode disposes old sight and creates new', async () => {
    const useSight = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ observe }: { observe: 'continuous' | 'once' }) =>
        useSight(ref, { observe }),
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
});
