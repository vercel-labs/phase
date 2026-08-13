import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';
import type { FrameState } from '../tick';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;
const openLoops: Array<{ stop: () => void }> = [];

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
  for (const loop of openLoops.splice(0)) loop.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getModule() {
  const module = await import('.');
  const createLoop: typeof module.createLoop = (options) => {
    const loop = module.createLoop(options);
    openLoops.push(loop);
    return loop;
  };
  return { ...module, createLoop };
}

function visible(element: Element): void {
  mockIO.trigger(element, true);
}

interface ManualRaf {
  pending(): number;
  step(gap?: number, occupied?: number): void;
  skip(ms: number): void;
  restore(): void;
}

function setupManualRaf(): ManualRaf {
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
    pending: () => callbacks.size,
    step(gap = 16, occupied = 0): void {
      time += gap;
      offset = occupied;
      const current = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of current) callback(time);
      offset = 0;
    },
    skip(ms: number): void {
      time += ms;
    },
    restore(): void {
      nowSpy.mockRestore();
    },
  };
}

function learnCadence(clock: ManualRaf, gap = 16): void {
  // First callback has no source gap; the following eight establish cadence.
  for (let index = 0; index < 9; index++) clock.step(gap);
}

function createVisibleElement(): HTMLElement {
  const element = document.createElement('div');
  return element;
}

describe('lifecycle composition', () => {
  it('starts paused until sight becomes visible', async () => {
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const loop = createLoop({ element, onTick: vi.fn() });

    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('sight');

    visible(element);
    expect(loop.phase).toBe('running');
    expect(loop.phaseReason).toBe('resumed');
  });

  it('manual start is idempotent and emits nothing before start', async () => {
    const { createLoop } = await getModule();
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const element = createVisibleElement();
    const onPhaseChange = vi.fn();
    const onQualityChange = vi.fn();
    const loop = createLoop({
      element,
      onTick: vi.fn(),
      start: 'manual',
      onPhaseChange,
      onQualityChange,
    });

    visible(element);
    expect(loop.phase).toBe('idle');
    expect(onPhaseChange).not.toHaveBeenCalled();
    expect(onQualityChange).not.toHaveBeenCalled();

    loop.start();
    loop.start();
    expect(loop.phase).toBe('paused');
    expect(loop.phaseReason).toBe('unfocused');
    expect(onQualityChange).toHaveBeenCalledTimes(1);
  });

  it('sight outranks reduced motion so offscreen work remains deferred', async () => {
    const { createLoop } = await getModule();
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    const element = createVisibleElement();
    const loop = createLoop({ element, onTick: vi.fn() });

    expect(loop.phaseReason).toBe('sight');
    visible(element);
    expect(loop.phaseReason).toBe('reduced-motion');
  });

  it('reduced motion strongly pauses and resumes the same timeline', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const frames: Array<{ elapsed: number; frame: number }> = [];
    createLoop({
      element,
      onTick: (frame) =>
        frames.push({ elapsed: frame.elapsed, frame: frame.frame }),
    });
    visible(element);

    clock.step();
    mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
    expect(clock.pending()).toBe(0);
    clock.skip(1000);
    mockMM.setMatches('(prefers-reduced-motion: reduce)', false);
    clock.step();

    expect(frames).toEqual([
      { elapsed: 16, frame: 1 },
      { elapsed: 32, frame: 2 },
    ]);
    clock.restore();
  });
});

describe('focus quality', () => {
  it('pauses by default and resumes from the frozen timeline', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const frames: Array<{ elapsed: number; frame: number }> = [];
    const loop = createLoop({
      element,
      onTick: (frame) =>
        frames.push({ elapsed: frame.elapsed, frame: frame.frame }),
    });
    visible(element);
    clock.step();

    const hasFocus = vi.spyOn(document, 'hasFocus');
    hasFocus.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(loop.quality).toMatchObject({
      status: 'degraded',
      signals: { unfocused: true },
      action: { behavior: 'pause' },
    });
    expect(loop.phaseReason).toBe('unfocused');
    expect(clock.pending()).toBe(0);

    clock.skip(500);
    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    clock.step();

    expect(loop.quality.status).toBe('full');
    expect(frames.at(-1)).toEqual({ elapsed: 32, frame: 2 });
    clock.restore();
  });

  it('throttles without resetting FrameState identity or elapsed', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const references: FrameState[] = [];
    const snapshots: Array<{ elapsed: number; frame: number }> = [];
    const loop = createLoop({
      element,
      unfocused: 'throttle',
      onTick: (frame) => {
        references.push(frame);
        snapshots.push({ elapsed: frame.elapsed, frame: frame.frame });
      },
    });
    visible(element);
    clock.step();

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    clock.step();
    clock.step();
    clock.step();

    expect(loop.phase).toBe('running');
    expect(loop.quality.action).toEqual({ behavior: 'throttle', fps: 30 });
    expect(references.every((frame) => frame === references[0])).toBe(true);
    expect(snapshots.at(-1)?.elapsed).toBe(64);
    expect(snapshots.at(-1)?.frame).toBe(3);
    clock.restore();
  });

  it('reports overlapping signals without losing either cause', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const loop = createLoop({
      element,
      unfocused: 'ignore',
      slowFrames: 'pause',
      onTick: vi.fn(),
    });
    visible(element);
    learnCadence(clock);
    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));

    expect(loop.quality).toMatchObject({
      status: 'degraded',
      signals: { unfocused: true, slowFrames: 'degraded' },
      action: { behavior: 'pause' },
    });
    expect(loop.phaseReason).toBe('slow-frames');
    clock.restore();
  });
});

describe('shared frame pressure', () => {
  it.each([
    ['native 30Hz', 30, undefined],
    ['120fps cap on 60Hz', 16, 120],
    ['50fps cap on 60Hz', 16, 50],
  ])('does not falsely degrade at %s', async (_label, gap, fps) => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const loop = createLoop({ element, fps, onTick: vi.fn() });
    visible(element);

    learnCadence(clock, gap);
    for (let index = 0; index < 20; index++) clock.step(gap);

    expect(loop.quality.status).toBe('full');
    clock.restore();
  });

  it('degrades from sustained shared dispatch pressure', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const loop = createLoop({ element, onTick: vi.fn() });
    visible(element);
    learnCadence(clock);

    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);

    expect(loop.quality).toMatchObject({
      status: 'degraded',
      signals: { slowFrames: 'degraded' },
      action: { behavior: 'throttle', fps: 30 },
    });
    clock.restore();
  });

  it('keeps quality degraded during probation until healthy evidence exists', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const changes: string[] = [];
    const loop = createLoop({
      element,
      onTick: vi.fn(),
      onQualityChange: (quality) => {
        changes.push(quality.signals.slowFrames ?? quality.status);
      },
    });
    visible(element);
    learnCadence(clock);
    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);

    await vi.advanceTimersByTimeAsync(2000);
    expect(loop.quality).toMatchObject({
      status: 'degraded',
      signals: { slowFrames: 'probing' },
      action: { behavior: 'ignore' },
    });

    for (let index = 0; index < 29; index++) clock.step(16, 1);
    expect(loop.quality.status).toBe('degraded');
    clock.step(16, 1);
    expect(loop.quality.status).toBe('full');
    expect(changes).toEqual(['degraded', 'probing', 'full']);
    clock.restore();
  });

  it('returns to mitigation without publishing full when a probe fails', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const statuses: string[] = [];
    const loop = createLoop({
      element,
      onTick: vi.fn(),
      onQualityChange: (quality) => {
        statuses.push(quality.signals.slowFrames ?? quality.status);
      },
    });
    visible(element);
    learnCadence(clock);
    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);
    await vi.advanceTimersByTimeAsync(2000);

    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);

    expect(loop.quality.signals.slowFrames).toBe('degraded');
    expect(statuses).toEqual(['degraded', 'probing', 'degraded']);
    expect(statuses).not.toContain('full');
    clock.restore();
  });

  it('uses one page-level pressure state for multiple loops', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const first = createVisibleElement();
    const second = createVisibleElement();
    const loopA = createLoop({ element: first, onTick: vi.fn() });
    const loopB = createLoop({
      element: second,
      slowFrames: 'ignore',
      onTick: vi.fn(),
    });
    visible(first);
    visible(second);
    learnCadence(clock);
    clock.step(16, 16);
    clock.step(16, 16);
    clock.step(16, 16);

    expect(loopA.quality.signals.slowFrames).toBe('degraded');
    expect(loopB.quality.signals.slowFrames).toBe('degraded');
    expect(loopA.quality.action?.behavior).toBe('throttle');
    expect(loopB.quality.action?.behavior).toBe('ignore');
    clock.restore();
  });
});

describe('transaction and reentrancy safety', () => {
  it('tears down before a throwing stopped callback', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    const loop = createLoop({
      element,
      onTick: vi.fn(),
      onPhaseChange: (phase) => {
        if (phase === 'stopped') throw new Error('consumer failure');
      },
    });
    visible(element);
    expect(clock.pending()).toBe(1);

    expect(() => loop.stop()).toThrow('consumer failure');
    expect(clock.pending()).toBe(0);
    expect(loop.phase).toBe('stopped');
    expect(() => loop.stop()).not.toThrow();
    clock.restore();
  });

  it('cleans up when an automatic construction callback throws', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();

    expect(() =>
      createLoop({
        element,
        onTick: vi.fn(),
        onPhaseChange: () => {
          throw new Error('construction failure');
        },
      }),
    ).toThrow('construction failure');
    expect(clock.pending()).toBe(0);
    clock.restore();
  });

  it('can stop reentrantly from onTick without another frame', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    let loop: ReturnType<typeof createLoop>;
    const onTick = vi.fn(() => loop.stop());
    loop = createLoop({ element, onTick });
    visible(element);

    clock.step();
    clock.step();
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(loop.phase).toBe('stopped');
    expect(clock.pending()).toBe(0);
    clock.restore();
  });

  it('finishes internal quality reconciliation before notifying consumers', async () => {
    const clock = setupManualRaf();
    const { createLoop } = await getModule();
    const element = createVisibleElement();
    let observedPhase: string | undefined;
    let loop: ReturnType<typeof createLoop>;
    loop = createLoop({
      element,
      onTick: vi.fn(),
      onQualityChange: () => {
        observedPhase = loop.phase;
        throw new Error('quality failure');
      },
    });
    visible(element);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(() => window.dispatchEvent(new Event('blur'))).not.toThrow();
    expect(observedPhase).toBe('paused');
    expect(loop.phaseReason).toBe('unfocused');
    expect(clock.pending()).toBe(0);
    clock.restore();
  });
});

describe('input contracts', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid base fps %s',
    async (fps) => {
      const { createLoop } = await getModule();
      expect(() =>
        createLoop({
          element: createVisibleElement(),
          fps,
          onTick: vi.fn(),
        }),
      ).toThrow();
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid throttle fps %s',
    async (throttleFps) => {
      const { createLoop } = await getModule();
      expect(() =>
        createLoop({
          element: createVisibleElement(),
          throttleFps,
          onTick: vi.fn(),
        }),
      ).toThrow();
    },
  );

  it('narrowed reduced-motion and quality options reject old values', async () => {
    const { createLoop } = await getModule();
    const element = createVisibleElement();

    createLoop({
      element,
      onTick: vi.fn(),
      // @ts-expect-error loops have no complete state
      reducedMotion: 'complete',
    });
    createLoop({
      element,
      onTick: vi.fn(),
      // @ts-expect-error replaced by independent signal policies
      degraded: 'pause',
    });
    createLoop({
      element,
      onTick: vi.fn(),
      // @ts-expect-error renamed to slowFrames
      frameBudget: 'pause',
    });
  });
});
