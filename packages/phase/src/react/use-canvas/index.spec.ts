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
