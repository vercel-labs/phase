import { act, renderHook } from '@testing-library/react';

import type { Size } from '.';
import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';
import { createMockResizeObserver } from '../../__mocks__/resize-observer';
import type { LoopQuality } from '../../core/loop';
import type { FrameState } from '../../core/tick';

type MutableFrame = { -readonly [K in keyof FrameState]: FrameState[K] };
type MutableSizeArg = { -readonly [K in keyof Size]: Size[K] };

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
  return (await import('.')).useCanvas;
}

function createCanvasWithMockContext() {
  const canvas = document.createElement('canvas');
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  return { canvas, context };
}

function setupManualRaf() {
  let time = 0;
  let offset = 0;
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const nowSpy = vi
    .spyOn(performance, 'now')
    .mockImplementation(() => time + offset);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback): number => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number): void => {
      callbacks.delete(id);
    }),
  );
  return {
    step(gap = 16, occupied = 0): void {
      time += gap;
      offset = occupied;
      const current = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of current) callback(time);
      offset = 0;
    },
    restore(): void {
      nowSpy.mockRestore();
    },
  };
}

describe('useCanvas lifecycle', () => {
  it('starts when late object refs receive their nodes', async () => {
    const useCanvas = await getHook();
    const containerRef: { current: Element | null } = { current: null };
    const canvasRef: { current: HTMLCanvasElement | null } = { current: null };
    const { result, rerender } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );
    expect(result.current.phase).toBe('idle');

    const container = document.createElement('div');
    const { canvas } = createCanvasWithMockContext();
    containerRef.current = container;
    canvasRef.current = canvas;
    rerender();
    act(() => mockIO.trigger(container, true));

    expect(result.current.phase).toBe('running');
  });

  it('recreates visibility observation when option values change', async () => {
    const useCanvas = await getHook();
    const containerRef = { current: document.createElement('div') };
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

    rerender({ rootMargin: '20px' });
    expect(mockIO.instances.at(-1)?.options?.rootMargin).toBe('20px');
  });

  it('resets quality when restart creates a fresh loop', async () => {
    const useCanvas = await getHook();
    const hasFocus = vi.spyOn(document, 'hasFocus');
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
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
      hasFocus.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.quality.status).toBe('degraded');

    hasFocus.mockReturnValue(true);
    act(() => result.current.restart());
    expect(result.current.quality.status).toBe('full');
  });
});

describe('buffer sizing', () => {
  it('uses exact physical pixels and axis-specific transforms', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas, context } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    renderHook(() => useCanvas({ containerRef, canvasRef, draw: vi.fn() }));
    act(() => mockIO.trigger(container, true));

    mockRO.triggerWithPhysicalSize(container, 375, 667, 751, 1335);

    expect(canvas.width).toBe(751);
    expect(canvas.height).toBe(1335);
    expect(context.setTransform).toHaveBeenLastCalledWith(
      751 / 375,
      0,
      0,
      1335 / 667,
      0,
      0,
    );
  });

  it('rounds DPR fallback dimensions and skips identical writes', async () => {
    const useCanvas = await getHook();
    vi.stubGlobal('devicePixelRatio', 1.5);
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    renderHook(() => useCanvas({ containerRef, canvasRef, draw: vi.fn() }));
    act(() => mockIO.trigger(container, true));
    const widthWrites = vi.spyOn(canvas, 'width', 'set');

    mockRO.triggerWithoutPhysicalSize(container, 101, 50);
    mockRO.triggerWithoutPhysicalSize(container, 101, 50);

    expect(canvas.width).toBe(152);
    expect(canvas.height).toBe(75);
    expect(widthWrites).toHaveBeenCalledTimes(1);
  });

  it('focus throttling never implicitly lowers pixel ratio', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const { result } = renderHook(() =>
      useCanvas({
        containerRef,
        canvasRef,
        draw: vi.fn(),
        unfocused: 'throttle',
      }),
    );
    act(() => mockIO.trigger(container, true));
    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);

    act(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.quality.action?.behavior).toBe('throttle');
    expect(canvas.width).toBe(750);
    expect(canvas.height).toBe(1334);
  });

  it('adaptive mode stays low-resolution through probation', async () => {
    const clock = setupManualRaf();
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const { result } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw: vi.fn() }),
    );
    act(() => mockIO.trigger(container, true));
    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);

    act(() => {
      for (let index = 0; index < 9; index++) clock.step();
      clock.step(16, 16);
      clock.step(16, 16);
      clock.step(16, 16);
    });
    expect(canvas.width).toBe(375);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.quality.signals.slowFrames).toBe('probing');
    expect(canvas.width).toBe(375);

    act(() => {
      for (let index = 0; index < 30; index++) clock.step(16, 1);
    });
    expect(result.current.quality.status).toBe('full');
    expect(canvas.width).toBe(750);
    clock.restore();
  });
});

describe('paused repaint behavior', () => {
  it('defers reduced-motion static drawing until visible', async () => {
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

    mockRO.trigger(container, 300, 200);
    expect(result.current.phaseReason).toBe('sight');
    expect(draw).not.toHaveBeenCalled();

    act(() => mockIO.trigger(container, true));
    expect(result.current.phaseReason).toBe('reduced-motion');
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]?.[1]).toMatchObject({ elapsed: 0, frame: 0 });
  });

  it('repaints the cached frame after resize while focus-paused', async () => {
    const clock = setupManualRaf();
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const draw = vi.fn();
    renderHook(() => useCanvas({ containerRef, canvasRef, draw }));
    act(() => mockIO.trigger(container, true));
    mockRO.trigger(container, 300, 200);
    clock.step();
    const deliveredFrame = draw.mock.calls.at(-1)?.[1] as FrameState;

    act(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    const callsBeforeResize = draw.mock.calls.length;
    mockRO.trigger(container, 400, 300);

    expect(draw).toHaveBeenCalledTimes(callsBeforeResize + 1);
    expect(draw.mock.calls.at(-1)?.[1]).toMatchObject({
      elapsed: deliveredFrame.elapsed,
      frame: deliveredFrame.frame,
    });
    clock.restore();
  });

  it('repaints after context restoration while paused', async () => {
    const clock = setupManualRaf();
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const draw = vi.fn();
    renderHook(() => useCanvas({ containerRef, canvasRef, draw }));
    act(() => mockIO.trigger(container, true));
    mockRO.trigger(container, 300, 200);
    clock.step();
    act(() => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });
    const callsBeforeRestore = draw.mock.calls.length;

    canvas.dispatchEvent(new Event('contextrestored'));
    expect(draw).toHaveBeenCalledTimes(callsBeforeRestore + 1);
    clock.restore();
  });
});

describe('quality observation', () => {
  it('is reactive by default', async () => {
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
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

    expect(result.current.quality.status).toBe('degraded');
    expect(result.current.qualityRef.current).toBe(result.current.quality);
  });

  it('updates buffers before transient notifications', async () => {
    const clock = setupManualRaf();
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const widths: number[] = [];
    const { result } = renderHook(() =>
      useCanvas({
        containerRef,
        canvasRef,
        draw: vi.fn(),
        onQualityChange: () => widths.push(canvas.width),
      }),
    );
    act(() => mockIO.trigger(container, true));
    mockRO.triggerWithPhysicalSize(container, 375, 667, 750, 1334);
    for (let index = 0; index < 9; index++) clock.step();
    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);

    expect(result.current.qualityRef.current.status).toBe('degraded');
    expect(widths.at(-1)).toBe(375);
    clock.restore();
  });

  it('stays reactive after onQualityChange is dropped', async () => {
    const useCanvas = await getHook();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const onQualityChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ transient }: { transient: boolean }) =>
        useCanvas({
          containerRef,
          canvasRef,
          draw: vi.fn(),
          unfocused: 'ignore',
          ...(transient ? { onQualityChange } : {}),
        }) as ReturnType<typeof useCanvas> & { quality?: LoopQuality },
      { initialProps: { transient: true } },
    );
    act(() => mockIO.trigger(container, true));

    // No loop dependency changes, so the effect and its callbacks persist.
    rerender({ transient: false });
    act(() => {
      hasFocus.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.quality?.status).toBe('degraded');
    expect(result.current.qualityRef.current.status).toBe('degraded');
    expect(onQualityChange).not.toHaveBeenCalled();
  });

  it('stops rendering on quality once onQualityChange is added', async () => {
    const useCanvas = await getHook();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const onQualityChange = vi.fn();
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ transient }: { transient: boolean }) => {
        renders++;
        return useCanvas({
          containerRef,
          canvasRef,
          draw: vi.fn(),
          unfocused: 'ignore',
          ...(transient ? { onQualityChange } : {}),
        });
      },
      { initialProps: { transient: false } },
    );
    act(() => mockIO.trigger(container, true));

    rerender({ transient: true });
    const rendersBeforeBlur = renders;
    act(() => {
      hasFocus.mockReturnValue(false);
      window.dispatchEvent(new Event('blur'));
    });

    expect(onQualityChange).toHaveBeenCalledTimes(1);
    expect(renders).toBe(rendersBeforeBlur);
    expect(result.current.qualityRef.current.status).toBe('degraded');
  });
});

describe('teardown', () => {
  it('does not size or draw a buffer while unmounting off screen', async () => {
    const clock = setupManualRaf();
    const useCanvas = await getHook();
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };
    const draw = vi.fn();
    const { unmount } = renderHook(() =>
      useCanvas({ containerRef, canvasRef, draw }),
    );

    act(() => mockIO.trigger(container, true));
    act(() => mockRO.trigger(container, 400, 300));
    act(() => clock.step(16));
    const drawsWhileVisible: number = draw.mock.calls.length;
    expect(drawsWhileVisible).toBeGreaterThan(0);

    // Scrolled away, then relaid out while hidden: the buffer stays cached.
    act(() => mockIO.trigger(container, false));
    act(() => mockRO.trigger(container, 800, 600));
    expect(canvas.width).toBe(400);
    expect(draw).toHaveBeenCalledTimes(drawsWhileVisible);

    // Teardown must not cash in that pending buffer.
    unmount();
    expect(canvas.width).toBe(400);
    expect(draw).toHaveBeenCalledTimes(drawsWhileVisible);
    clock.restore();
  });
});

describe('draw argument integrity', () => {
  it('a consumer writing through a repaint frame cannot corrupt later repaints', async () => {
    const clock = setupManualRaf();
    const useCanvas = await getHook();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const container = document.createElement('div');
    const containerRef = { current: container };
    const { canvas } = createCanvasWithMockContext();
    const canvasRef = { current: canvas };

    const seen: Array<{ elapsed: number; frame: number; width: number }> = [];
    let scribble = false;
    const draw = vi.fn((_ctx, frame: FrameState, size: Size) => {
      seen.push({
        elapsed: frame.elapsed,
        frame: frame.frame,
        width: size.width,
      });
      if (!scribble) return;
      (frame as MutableFrame).elapsed = -999;
      (frame as MutableFrame).frame = -1;
      (size as MutableSizeArg).width = -1;
    });

    renderHook(() => useCanvas({ containerRef, canvasRef, draw }));
    act(() => mockIO.trigger(container, true));
    act(() => mockRO.trigger(container, 400, 300));
    act(() => clock.step(16));
    act(() => clock.step(16));
    const live = seen.at(-1);

    hasFocus.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('blur')));

    scribble = true;
    act(() => mockRO.trigger(container, 500, 400));
    scribble = false;
    act(() => mockRO.trigger(container, 600, 500));

    expect(live).toEqual({ elapsed: 32, frame: 2, width: 400 });
    expect(seen.at(-1)).toEqual({ elapsed: 32, frame: 2, width: 600 });
    clock.restore();
  });
});
