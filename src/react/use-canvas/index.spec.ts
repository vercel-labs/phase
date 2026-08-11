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
// Reduced-motion paint
// ---------------------------------------------------------------------------

describe('reduced-motion paint', () => {
  it('paints one static frame instead of staying blank', async () => {
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
    expect(draw).not.toHaveBeenCalled();

    act(() => {
      mockIO.trigger(container, true);
      vi.advanceTimersByTime(16); // fire the one-shot paint rAF
    });

    expect(draw).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('paused');
    expect(result.current.phaseReason).toBe('reduced-motion');

    // Still paused: no further draws.
    act(() => {
      vi.advanceTimersByTime(48);
    });
    expect(draw).toHaveBeenCalledTimes(1);
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
