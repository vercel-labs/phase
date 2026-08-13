import { act, renderHook } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
  mockIO = createMockIntersectionObserver();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useLoop;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useLoop', () => {
  it('returns initial state with full quality', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useLoop({ ref, onTick: vi.fn() }));
    // Before sight reports, loop is paused
    expect(result.current.quality.status).toBe('full');
    expect(result.current.qualityRef.current).toBe(result.current.quality);
  });

  it('returns a ref when none is provided', async () => {
    const useLoop = await getHook();
    const { result } = renderHook(() => useLoop({ onTick: vi.fn() }));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('enabled=false stays idle', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useLoop({ ref, onTick: vi.fn(), enabled: false }),
    );
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('null ref does not throw, stays idle', async () => {
    const useLoop = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() =>
      useLoop({ ref: nullRef, onTick: vi.fn() }),
    );
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('cleans up loop on unmount', async () => {
    const useLoop = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useLoop({ ref, onTick: vi.fn() }));

    unmount();
    // IO trigger after unmount should not throw
    expect(() => mockIO.trigger(el, true)).not.toThrow();
  });

  it('enabled toggle: true -> false -> true', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLoop({ ref, onTick: vi.fn(), enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');

    rerender({ enabled: true });
    // Should leave the disabled idle state once re-enabled
    expect(result.current.phase).not.toBe('idle');
  });

  it('recreates the observer when intersection option values change', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { rerender } = renderHook(
      ({ threshold }: { threshold: number }) =>
        useLoop({
          ref,
          onTick: vi.fn(),
          intersectionOptions: { threshold },
        }),
      { initialProps: { threshold: 0.25 } },
    );
    expect(mockIO.instances.at(-1)?.options?.threshold).toBe(0.25);

    rerender({ threshold: 0.75 });
    expect(mockIO.instances.at(-1)?.options?.threshold).toBe(0.75);
  });

  it('transient quality stays current without rendering', async () => {
    const useLoop = await getHook();
    const { ref, el } = createRefWithElement();
    const onQualityChange = vi.fn();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useLoop({
        ref,
        onTick: vi.fn(),
        unfocused: 'throttle',
        onQualityChange,
      });
    });
    act(() => {
      mockIO.trigger(el, true);
    });
    expect(result.current.phase).toBe('running');
    expect(result.current.qualityRef.current.status).toBe('full');
    const rendersBeforeBlur = renders;

    act(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.phase).toBe('running');
    expect(result.current.qualityRef.current).toMatchObject({
      status: 'degraded',
      signals: { unfocused: true },
      action: { behavior: 'throttle', fps: 30 },
    });
    expect(onQualityChange).toHaveBeenCalledWith(
      result.current.qualityRef.current,
    );
    expect(renders).toBe(rendersBeforeBlur);
  });

  it('reactive quality renders by default', async () => {
    const useLoop = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useLoop({ ref, onTick: vi.fn(), unfocused: 'ignore' }),
    );
    act(() => {
      mockIO.trigger(el, true);
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.quality.status).toBe('degraded');
    expect(result.current.quality.signals.unfocused).toBe(true);
    expect(result.current.qualityRef.current).toBe(result.current.quality);
  });

  it('resets quality when options reconstruct the core loop', async () => {
    const useLoop = await getHook();
    const { ref, el } = createRefWithElement();
    const hasFocus = vi.spyOn(document, 'hasFocus');
    const { result, rerender } = renderHook(
      ({ fps }: { fps?: number }) =>
        useLoop({ ref, fps, onTick: vi.fn(), unfocused: 'ignore' }),
      { initialProps: { fps: undefined as number | undefined } },
    );
    act(() => {
      mockIO.trigger(el, true);
      hasFocus.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.quality.status).toBe('degraded');

    hasFocus.mockReturnValue(true);
    rerender({ fps: 30 });
    expect(result.current.quality.status).toBe('full');
  });

  it('attaches when an object ref receives a node after mount', async () => {
    const useLoop = await getHook();
    const ref: { current: HTMLDivElement | null } = { current: null };
    const { result, rerender } = renderHook(() =>
      useLoop({ ref, onTick: vi.fn() }),
    );
    expect(result.current.phase).toBe('idle');

    const element = document.createElement('div');
    ref.current = element;
    rerender();
    act(() => {
      mockIO.trigger(element, true);
    });
    expect(result.current.phase).toBe('running');
  });
});
