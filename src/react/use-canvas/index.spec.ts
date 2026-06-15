import { renderHook } from '@testing-library/react';

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
