import { act, renderHook } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';
import { createMockResizeObserver } from '../../__mocks__/resize-observer';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;
let mockRO: ReturnType<typeof createMockResizeObserver>;

beforeEach(() => {
  vi.useFakeTimers();
  mockIO = createMockIntersectionObserver();
  mockMM = createMockMatchMedia();
  mockRO = createMockResizeObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
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
  return mod.useCanvas;
}

function createCanvasWithMockContext() {
  const canvas = document.createElement('canvas');
  const mockCtx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx);
  return { canvas, mockCtx };
}

describe('useCanvas', () => {
  it('returns initial state with restart function', async () => {
    const useCanvas = await getHook();
    const containerRef = { current: document.createElement('div') };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );
    expect(result.current.phase).toBeDefined();
    expect(typeof result.current.restart).toBe('function');
  });

  it('enabled=false does not throw', async () => {
    const useCanvas = await getHook();
    const containerRef = { current: document.createElement('div') };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    expect(() => {
      renderHook(() =>
        useCanvas({
          containerRef,
          canvasRef,
          draw: vi.fn(),
          enabled: false,
        }),
      );
    }).not.toThrow();
  });

  it('null containerRef does not throw', async () => {
    const useCanvas = await getHook();
    const containerRef = { current: null };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    expect(() => {
      renderHook(() => useCanvas({ containerRef, canvasRef, draw: vi.fn() }));
    }).not.toThrow();
  });

  it('null canvasRef does not throw', async () => {
    const useCanvas = await getHook();
    const containerRef = { current: document.createElement('div') };
    const canvasRef = { current: null };
    expect(() => {
      renderHook(() => useCanvas({ containerRef, canvasRef, draw: vi.fn() }));
    }).not.toThrow();
  });

  it('recreates visibility observation when intersection values change', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const { rerender } = renderHook(
      ({ rootMargin }: { rootMargin: string }) =>
        useCanvas({
          containerRef,
          canvasRef,
          draw: vi.fn(),
          intersectionOptions: { rootMargin },
        }),
      { initialProps: { rootMargin: '10px' } },
    );
    expect(mockIO.instances.at(-1)?.options?.rootMargin).toBe('10px');

    rerender({ rootMargin: '20px' });
    expect(mockIO.instances.at(-1)?.options?.rootMargin).toBe('20px');
  });
});

// ---------------------------------------------------------------------------
// devicePixelContentBoxSize progressive enhancement
// ---------------------------------------------------------------------------

describe('devicePixelContentBoxSize', () => {
  it('uses physical pixel dimensions when devicePixelContentBoxSize is available', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas, mockCtx: _mockCtx } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 2);

    renderHook(() => useCanvas({ containerRef, canvasRef, draw: vi.fn() }));

    // Trigger RO with physical size: CSS 375x667, physical 750x1334
    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);

    expect(canvas.width).toBe(750);
    expect(canvas.height).toBe(1334);
  });

  it('falls back to contentBoxSize * dpr when devicePixelContentBoxSize is absent', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas, mockCtx: _mockCtx } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 2);

    renderHook(() => useCanvas({ containerRef, canvasRef, draw: vi.fn() }));

    // Trigger RO without physical size (Safari path)
    mockRO.triggerWithoutPhysicalSize(container, 375, 667);

    expect(canvas.width).toBe(750);
    expect(canvas.height).toBe(1334);
  });
});

// ---------------------------------------------------------------------------
// Reduced-motion static paint
// ---------------------------------------------------------------------------

describe('reduced-motion static paint', () => {
  it('paints one static frame per buffer creation instead of staying blank', async () => {
    const useCanvas = await getHook();
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const draw = vi.fn();

    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw }),
    );
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('reduced-motion');
    expect(draw).not.toHaveBeenCalled();

    // The first size delivery creates the buffer and paints the static frame.
    mockRO.trigger(container, 300, 200);
    expect(draw).toHaveBeenCalledTimes(1);
    const [, frame, size] = draw.mock.calls[0] as [
      unknown,
      { elapsed: number; frame: number },
      { width: number; height: number },
    ];
    expect(frame.elapsed).toBe(0);
    expect(frame.frame).toBe(0);
    expect(size).toEqual({ width: 300, height: 200 });

    // The loop is strongly paused: time passing draws nothing.
    act(() => {
      vi.advanceTimersByTime(64);
    });
    expect(draw).toHaveBeenCalledTimes(1);

    // A resize clears the bitmap, so the static frame repaints at the new
    // size (previously this left the canvas blank).
    mockRO.trigger(container, 400, 300);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[1]?.[2]).toEqual({ width: 400, height: 300 });

    // A same-size report does not touch the buffer or repaint.
    mockRO.trigger(container, 400, 300);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('does not static-paint when reduced motion is inactive', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const draw = vi.fn();

    renderHook(() => useCanvas({ containerRef, canvasRef, draw }));
    mockRO.trigger(container, 300, 200);
    expect(draw).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Buffer reallocation guards
// ---------------------------------------------------------------------------

describe('buffer reallocation', () => {
  it('skips redundant buffer writes for unchanged dimensions', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 1);

    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );
    const widthSets = vi.spyOn(canvas, 'width', 'set');

    mockRO.trigger(container, 100, 50);
    expect(widthSets).toHaveBeenCalledTimes(1);

    // Same dimensions again: assigning canvas.width clears the bitmap, so
    // the write must be skipped entirely.
    mockRO.trigger(container, 100, 50);
    expect(widthSets).toHaveBeenCalledTimes(1);

    // Phase transitions do not touch the buffer either.
    act(() => {
      mockIO.trigger(container, true);
    });
    expect(result.current.phase).toBe('running');
    expect(widthSets).toHaveBeenCalledTimes(1);
  });

  it('preserves exact physical sizing across quality transitions', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 2);

    renderHook(() =>
      useCanvas({
        containerRef,
        canvasRef,
        draw: vi.fn(),
        unfocused: 'throttle',
      }),
    );
    act(() => {
      mockIO.trigger(container, true);
    });
    // Physical box intentionally differs from width * dpr (751 vs 750).
    mockRO.triggerWithPhysicalSize(container, 375, 667, 751, 1335);
    expect(canvas.width).toBe(751);

    const hasFocusSpy = vi.spyOn(document, 'hasFocus');
    act(() => {
      hasFocusSpy.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    expect(canvas.width).toBe(375); // throttled: 1x CSS pixels

    act(() => {
      hasFocusSpy.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));
    });
    // Restores the cached exact physical size, not width * dpr.
    expect(canvas.width).toBe(751);
    expect(canvas.height).toBe(1335);
  });
});

// ---------------------------------------------------------------------------
// Degraded buffer scaling
// ---------------------------------------------------------------------------

describe('degraded buffer scaling', () => {
  it('paused-degraded (blur, default) keeps the full-res buffer', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 2);

    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );
    act(() => {
      mockIO.trigger(container, true);
    });
    expect(result.current.phase).toBe('running');

    // Blur pauses by default; quality reads degraded while paused.
    act(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.phase).toBe('paused');
    expect(result.current.quality).toBe('degraded');
    expect(result.current.qualityBehavior).toBe('pause');

    // A resize during the pause must not downscale the buffer.
    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);
    expect(canvas.width).toBe(750);
    expect(canvas.height).toBe(1334);
  });

  it('running-degraded (throttle) downscales the buffer', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 2);

    const { result } = renderHook(() =>
      useCanvas({
        containerRef,
        canvasRef,
        draw: vi.fn(),
        unfocused: 'throttle',
      }),
    );
    act(() => {
      mockIO.trigger(container, true);
    });

    act(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.phase).toBe('running');
    expect(result.current.quality).toBe('degraded');
    expect(result.current.qualityReason).toBe('unfocused');
    expect(result.current.qualityBehavior).toBe('throttle');

    // Degraded output at low fps: render into a CSS-pixel buffer.
    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);
    expect(canvas.width).toBe(375);
    expect(canvas.height).toBe(667);
  });

  it("running-degraded with 'ignore' keeps the full-res buffer", async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 2);

    const { result } = renderHook(() =>
      useCanvas({
        containerRef,
        canvasRef,
        draw: vi.fn(),
        unfocused: 'ignore',
      }),
    );
    act(() => {
      mockIO.trigger(container, true);
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.phase).toBe('running');
    expect(result.current.quality).toBe('degraded');
    expect(result.current.qualityReason).toBe('unfocused');
    expect(result.current.qualityBehavior).toBe('ignore');

    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);
    expect(canvas.width).toBe(750);
    expect(canvas.height).toBe(1334);
  });
});

// ---------------------------------------------------------------------------
// restart
// ---------------------------------------------------------------------------

describe('restart', () => {
  it('re-establishes resize observation after restart', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    vi.stubGlobal('devicePixelRatio', 1);

    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );

    mockRO.trigger(container, 100, 50);
    expect(canvas.width).toBe(100);

    act(() => {
      result.current.restart();
    });

    // After restart the container must still be observed and resizes applied.
    expect(mockRO.instances.some((i) => i.observed.has(container))).toBe(true);
    mockRO.trigger(container, 200, 80);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(80);
  });

  it('keeps the loop running after restart', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );
    act(() => {
      mockIO.trigger(container, true);
    });
    expect(result.current.phase).toBe('running');

    act(() => {
      result.current.restart();
    });
    act(() => {
      mockIO.trigger(container, true);
    });

    expect(result.current.phase).toBe('running');
  });
});
