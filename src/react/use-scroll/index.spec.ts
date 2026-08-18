import { renderHook, act } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockResizeObserver } from '../../__mocks__/resize-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockRO: ReturnType<typeof createMockResizeObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockRO = createMockResizeObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
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

function makeScrollable(
  el: HTMLElement,
  scrollWidth: number,
  clientWidth: number,
) {
  let left = 0;
  Object.defineProperty(el, 'scrollWidth', {
    value: scrollWidth,
    configurable: true,
  });
  Object.defineProperty(el, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
  Object.defineProperty(el, 'scrollHeight', { value: 0, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 0, configurable: true });
  Object.defineProperty(el, 'scrollLeft', {
    get: () => left,
    set: (v: number) => {
      left = v;
    },
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });
}

function createRefWithElement(scrollWidth = 400, clientWidth = 100) {
  const el = document.createElement('div');
  makeScrollable(el, scrollWidth, clientWidth);
  return { ref: { current: el }, el };
}

/** Give the page scroller mutable vertical geometry (jsdom reports 0). */
function makePageScrollable(scrollHeight: number, clientHeight: number) {
  const el = document.documentElement;
  let top = 0;
  const define = (key: string, value: number) =>
    Object.defineProperty(el, key, { value, configurable: true });
  define('scrollHeight', scrollHeight);
  define('clientHeight', clientHeight);
  define('scrollWidth', 0);
  define('clientWidth', 0);
  define('scrollLeft', 0);
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    set: (v: number) => {
      top = v;
    },
    configurable: true,
  });
}

async function getHook() {
  const mod = await import('.');
  return mod.useScroll;
}

// ---------------------------------------------------------------------------
// Ref management
// ---------------------------------------------------------------------------

describe('ref management', () => {
  it('returns a ref when none is provided', async () => {
    const useScroll = await getHook();
    const { result } = renderHook(() => useScroll({ onScroll: vi.fn() }));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('accepts an external ref', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useScroll({ ref, onScroll: vi.fn() }));
    expect(result.current.ref).toBe(ref);
  });
});

// ---------------------------------------------------------------------------
// Reactive phase
// ---------------------------------------------------------------------------

describe('reactive phase', () => {
  it('tracks immediately with visibility ignore', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore' }),
    );
    expect(result.current.phase).toBe('tracking');
    expect(result.current.phaseReason).toBe('started');
  });

  it('stays paused until the element is visible', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() => useScroll({ ref, onScroll: vi.fn() }));
    expect(result.current.phase).toBe('paused');

    act(() => {
      mockIO.trigger(el, true);
    });
    expect(result.current.phase).toBe('tracking');

    act(() => {
      mockIO.trigger(el, false);
    });
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('sight');
  });

  it('resets to initial when enabled is false', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore', enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('initial');
  });
});

// ---------------------------------------------------------------------------
// stateRef + onScroll
// ---------------------------------------------------------------------------

describe('scroll delivery', () => {
  it('mirrors the latest scroll position without a re-render', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement(400, 100);
    const { result } = renderHook(() =>
      useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore' }),
    );

    await act(async () => {
      el.scrollLeft = 150;
      el.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.stateRef.current.x).toBe(150);
    expect(result.current.stateRef.current.progressX).toBeCloseTo(0.5);
  });

  it('exposes a stable measure() that recomputes geometry', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement(400, 100);
    const { result, rerender } = renderHook(() =>
      useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore' }),
    );

    const firstMeasure = result.current.measure;
    expect(result.current.stateRef.current.maxX).toBe(300);

    act(() => {
      Object.defineProperty(el, 'scrollWidth', {
        value: 900,
        configurable: true,
      });
      result.current.measure();
    });
    expect(result.current.stateRef.current.maxX).toBe(800);

    rerender();
    expect(result.current.measure).toBe(firstMeasure); // stable identity
  });

  it('onScroll identity change does not restart the tracker', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement(400, 100);
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useScroll({ ref, onScroll: cb, visibility: 'ignore' }),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });
    first.mockClear();

    await act(async () => {
      el.scrollLeft = 120;
      el.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

describe('teardown', () => {
  it('tears down on unmount without error', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement();
    const { unmount } = renderHook(() => useScroll({ ref, onScroll: vi.fn() }));
    expect(() => unmount()).not.toThrow();
  });

  it('stops delivering onScroll after unmount', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement(400, 100);
    const onScroll = vi.fn();
    const { unmount } = renderHook(() =>
      useScroll({ ref, onScroll, visibility: 'ignore' }),
    );
    unmount();
    onScroll.mockClear();

    await act(async () => {
      el.scrollLeft = 100;
      el.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onScroll).not.toHaveBeenCalled();
  });

  it('measure() is null-safe after unmount', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement();
    const { result, unmount } = renderHook(() =>
      useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore' }),
    );
    unmount();
    expect(() => result.current.measure()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Zero re-render on scroll (the core guarantee)
// ---------------------------------------------------------------------------

describe('re-render behavior', () => {
  it('does not re-render on scroll', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement(400, 100);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore' });
    });

    const baseline = renders; // settled after mount + the tracking phase setState

    await act(async () => {
      el.scrollLeft = 100;
      el.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      el.scrollLeft = 200;
      el.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(renders).toBe(baseline); // scrolling never triggers a render
    expect(result.current.stateRef.current.x).toBe(200);
  });

  it('phaseRef is current alongside state', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore' }),
    );
    expect(result.current.phase).toBe('tracking');
    expect(result.current.phaseRef.current).toBe('tracking');
    expect(result.current.phaseReasonRef.current).toBe('started');
  });

  it('resets stateRef when enabled is false', async () => {
    const useScroll = await getHook();
    const { ref } = createRefWithElement(400, 100);
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useScroll({ ref, onScroll: vi.fn(), visibility: 'ignore', enabled }),
      { initialProps: { enabled: true } },
    );
    expect(result.current.stateRef.current.maxX).toBe(300);

    rerender({ enabled: false });
    expect(result.current.stateRef.current).toEqual({
      x: 0,
      y: 0,
      maxX: 0,
      maxY: 0,
      progressX: 0,
      progressY: 0,
      visibleX: 1,
      visibleY: 1,
    });
  });

  it('re-subscribes when the visibility prop changes', async () => {
    const useScroll = await getHook();
    const { ref, el } = createRefWithElement(400, 100);
    const { result, rerender } = renderHook(
      ({ visibility }: { visibility: 'ignore' | 'pause' }) =>
        useScroll({ ref, onScroll: vi.fn(), visibility }),
      { initialProps: { visibility: 'ignore' as 'ignore' | 'pause' } },
    );
    expect(result.current.phase).toBe('tracking');

    rerender({ visibility: 'pause' });
    act(() => {
      mockIO.trigger(el, true); // only a pause-mode instance observes IO
    });
    expect(result.current.phase).toBe('tracking');
    expect(result.current.phaseReason).toBe('started');

    act(() => {
      mockIO.trigger(el, false);
    });
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('sight');
  });
});

// ---------------------------------------------------------------------------
// Page target
// ---------------------------------------------------------------------------

describe('page target', () => {
  it('tracks the page when given document, with no ref attached', async () => {
    const useScroll = await getHook();
    makePageScrollable(5000, 1000);

    const { result } = renderHook(() =>
      useScroll({ target: document, onScroll: vi.fn() }),
    );

    expect(result.current.phase).toBe('tracking');
    expect(result.current.stateRef.current.maxY).toBe(4000);
    expect(mockIO.instances).toHaveLength(0);
  });

  it('delivers page scroll through onScroll', async () => {
    const useScroll = await getHook();
    makePageScrollable(5000, 1000);
    const onScroll = vi.fn();

    renderHook(() => useScroll({ target: document, onScroll }));
    onScroll.mockClear();

    document.documentElement.scrollTop = 1000;
    await act(async () => {
      document.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll.mock.lastCall?.[0].progressY).toBe(0.25);
  });

  it('throws when both ref and target are given', async () => {
    const useScroll = await getHook();
    makePageScrollable(5000, 1000);
    const { ref } = createRefWithElement();

    expect(() =>
      renderHook(() => useScroll({ ref, target: document, onScroll: vi.fn() })),
    ).toThrowError(/both ref and target/);
  });

  it('tears down page listeners on unmount', async () => {
    const useScroll = await getHook();
    makePageScrollable(5000, 1000);
    const onScroll = vi.fn();

    const { unmount } = renderHook(() =>
      useScroll({ target: document, onScroll }),
    );
    unmount();
    onScroll.mockClear();

    document.documentElement.scrollTop = 2000;
    await act(async () => {
      document.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onScroll).not.toHaveBeenCalled();
  });
});
