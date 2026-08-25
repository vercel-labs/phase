beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

async function getModule() {
  return import('.');
}

function advanceFrame(ms = 16): void {
  vi.advanceTimersByTime(ms);
}

function createRafDriver(firstId = 1, idStep = 1) {
  let nextId = firstId;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = nextId;
    nextId += idStep;
    pending.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number): void => {
    pending.delete(id);
  });

  function frame(timestamp: number): void {
    const callbacks = Array.from(pending.values());
    pending.clear();
    for (const callback of callbacks) callback(timestamp);
  }

  return { request, cancel, frame, pending };
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

describe('phase transitions', () => {
  describe('from idle', () => {
    it('start() -> running, reason=started', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      expect(ticker.phase).toBe('idle');
      expect(ticker.phaseReason).toBe('initial');
      ticker.start();
      expect(ticker.phase).toBe('running');
      expect(ticker.phaseReason).toBe('started');
      ticker.stop();
    });

    it('pause() is no-op, stays idle', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.pause();
      expect(ticker.phase).toBe('idle');
      ticker.stop();
    });

    it('resume() is no-op, stays idle', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.resume();
      expect(ticker.phase).toBe('idle');
      ticker.stop();
    });

    it('stop() -> stopped, reason=disposed (never started)', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.stop();
      expect(ticker.phase).toBe('stopped');
      expect(ticker.phaseReason).toBe('disposed');
    });
  });

  describe('from running', () => {
    it('start() is no-op, stays running', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.start();
      expect(ticker.phase).toBe('running');
      ticker.stop();
    });

    it('pause() -> paused, reason=manual', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.pause();
      expect(ticker.phase).toBe('paused');
      expect(ticker.phaseReason).toBe('manual');
      ticker.stop();
    });

    it('resume() is no-op, stays running', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.resume();
      expect(ticker.phase).toBe('running');
      ticker.stop();
    });

    it('stop() -> stopped, reason=manual', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.stop();
      expect(ticker.phase).toBe('stopped');
      expect(ticker.phaseReason).toBe('manual');
    });
  });

  describe('from paused', () => {
    it('start() delegates to resume() -> running, reason=resumed', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.pause();
      ticker.start();
      expect(ticker.phase).toBe('running');
      expect(ticker.phaseReason).toBe('resumed');
      ticker.stop();
    });

    it('pause() is no-op, stays paused', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.pause();
      ticker.pause();
      expect(ticker.phase).toBe('paused');
      ticker.stop();
    });

    it('resume() -> running, reason=resumed', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.pause();
      ticker.resume();
      expect(ticker.phase).toBe('running');
      expect(ticker.phaseReason).toBe('resumed');
      ticker.stop();
    });

    it('stop() -> stopped, reason=manual', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.start();
      ticker.pause();
      ticker.stop();
      expect(ticker.phase).toBe('stopped');
      expect(ticker.phaseReason).toBe('manual');
    });
  });

  describe('from stopped (terminal)', () => {
    it('start() throws', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.stop();
      expect(() => ticker.start()).toThrow();
    });

    it('resume() throws', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.stop();
      expect(() => ticker.resume()).toThrow();
    });

    it('pause() is no-op', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.stop();
      expect(() => ticker.pause()).not.toThrow();
      expect(ticker.phase).toBe('stopped');
    });

    it('stop() is idempotent', async () => {
      const { createTicker } = await getModule();
      const ticker = createTicker({ onTick: vi.fn() });
      ticker.stop();
      expect(() => ticker.stop()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Frame state
// ---------------------------------------------------------------------------

describe('frame state', () => {
  it('onTick fires and receives FrameState fields', async () => {
    const { createTicker } = await getModule();
    const frames: Array<{
      time: number;
      delta: number;
      elapsed: number;
      frame: number;
    }> = [];
    const ticker = createTicker({ onTick: (f) => frames.push({ ...f }) });
    ticker.start();
    advanceFrame();
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0]).toHaveProperty('time');
    expect(frames[0]).toHaveProperty('delta');
    expect(frames[0]).toHaveProperty('elapsed');
    expect(frames[0]).toHaveProperty('frame');
    ticker.stop();
  });

  it('frame counter increments by 1 each tick', async () => {
    const { createTicker } = await getModule();
    const counts: number[] = [];
    const ticker = createTicker({ onTick: (f) => counts.push(f.frame) });
    ticker.start();
    advanceFrame();
    advanceFrame();
    advanceFrame();
    expect(counts).toEqual([1, 2, 3]);
    ticker.stop();
  });

  it('FrameState is the same object reference (reused)', async () => {
    const { createTicker } = await getModule();
    const refs: unknown[] = [];
    const ticker = createTicker({ onTick: (f) => refs.push(f) });
    ticker.start();
    advanceFrame();
    advanceFrame();
    expect(refs[0]).toBe(refs[1]);
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// Delta clamping
// ---------------------------------------------------------------------------

describe('delta clamping', () => {
  it('delta is clamped to 40ms when raw delta exceeds it', async () => {
    const { createTicker } = await getModule();
    let lastDelta = 0;
    const ticker = createTicker({
      onTick: (f) => {
        lastDelta = f.delta;
      },
    });
    ticker.start();
    advanceFrame(16);
    advanceFrame(200);
    expect(lastDelta).toBeLessThanOrEqual(40);
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// Elapsed time
// ---------------------------------------------------------------------------

describe('elapsed time', () => {
  it('elapsed increases across frames', async () => {
    const { createTicker } = await getModule();
    const vals: number[] = [];
    const ticker = createTicker({ onTick: (f) => vals.push(f.elapsed) });
    ticker.start();
    advanceFrame(16);
    advanceFrame(16);
    advanceFrame(16);
    expect(vals.length).toBeGreaterThanOrEqual(3);
    expect(vals[1] as number).toBeGreaterThan(vals[0] as number);
    expect(vals[2] as number).toBeGreaterThan(vals[1] as number);
    ticker.stop();
  });

  it('elapsed EXCLUDES paused time', async () => {
    const { createTicker } = await getModule();
    let lastElapsed = 0;
    const ticker = createTicker({
      onTick: (f) => {
        lastElapsed = f.elapsed;
      },
    });
    ticker.start();
    advanceFrame(16);
    const before = lastElapsed;
    ticker.pause();
    advanceFrame(1000);
    ticker.resume();
    advanceFrame(16);
    const after = lastElapsed;
    expect(after - before).toBeLessThan(100);
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// FPS cap
// ---------------------------------------------------------------------------

describe('FPS cap', () => {
  it('uncapped: onTick fires every rAF frame', async () => {
    const { createTicker } = await getModule();
    const cb = vi.fn();
    const ticker = createTicker({ onTick: cb });
    ticker.start();
    advanceFrame(16);
    advanceFrame(16);
    advanceFrame(16);
    expect(cb).toHaveBeenCalledTimes(3);
    ticker.stop();
  });

  it('fps: 30 skips frames under 33ms', async () => {
    const { createTicker } = await getModule();
    const cb = vi.fn();
    const ticker = createTicker({ fps: 30, onTick: cb });
    ticker.start();
    // Three 16ms frames = 48ms total, should fire once or twice at 30fps
    advanceFrame(16);
    advanceFrame(16);
    advanceFrame(16);
    // At 30fps (33ms interval), we expect fewer calls than 3
    expect(cb.mock.calls.length).toBeLessThan(3);
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// FPS validation
// ---------------------------------------------------------------------------

describe('FPS validation', () => {
  const invalidValues = [0, -1, Number.NaN, Infinity, -Infinity];

  it.each(invalidValues)(
    'constructor rejects fps: %d synchronously',
    async (fps) => {
      const { createTicker } = await getModule();
      const { isPhaseError } = await import('../_internal/errors');
      let thrown: unknown;
      try {
        createTicker({ fps, onTick: vi.fn() });
      } catch (error) {
        thrown = error;
      }
      expect(isPhaseError(thrown) && thrown.code === 'invalid_fps').toBe(true);
    },
  );

  it('constructor accepts undefined fps (uncapped)', async () => {
    const { createTicker } = await getModule();
    expect(() => createTicker({ onTick: vi.fn() })).not.toThrow();
  });

  it.each(invalidValues)(
    'setFps(%d) throws invalid_fps and leaves the active cap intact',
    async (fps) => {
      const raf = createRafDriver();
      vi.stubGlobal('requestAnimationFrame', raf.request);
      vi.stubGlobal('cancelAnimationFrame', raf.cancel);
      const { createTicker } = await getModule();
      const { isPhaseError } = await import('../_internal/errors');
      const cb = vi.fn();
      const ticker = createTicker({ fps: 30, onTick: cb });
      ticker.start();
      // 60Hz stream: a 30fps cap delivers roughly every other frame.
      for (let i = 1; i <= 60; i++) raf.frame(i * (1000 / 60));
      const before = cb.mock.calls.length;

      let thrown: unknown;
      try {
        ticker.setFps(fps);
      } catch (error) {
        thrown = error;
      }
      expect(isPhaseError(thrown) && thrown.code === 'invalid_fps').toBe(true);

      // Cap unchanged: another second of 60Hz frames still paces at ~30fps.
      for (let i = 61; i <= 120; i++) raf.frame(i * (1000 / 60));
      const after = cb.mock.calls.length - before;
      expect(after).toBeGreaterThanOrEqual(29);
      expect(after).toBeLessThanOrEqual(31);
      ticker.stop();
    },
  );

  it('setFps on a stopped ticker throws ticker_stopped, even for invalid fps', async () => {
    const { createTicker } = await getModule();
    const { isPhaseError } = await import('../_internal/errors');
    const ticker = createTicker({ onTick: vi.fn() });
    ticker.stop();
    for (const fps of [60, undefined, 0, Number.NaN]) {
      let thrown: unknown;
      try {
        ticker.setFps(fps);
      } catch (error) {
        thrown = error;
      }
      expect(isPhaseError(thrown) && thrown.code === 'ticker_stopped').toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// FPS cap cadence
// ---------------------------------------------------------------------------

/** Source timestamp stream at a given rate, fractional or integer-rounded. */
function sourceStream(
  rateHz: number,
  count: number,
  rounding: 'fractional' | 'integer',
): number[] {
  const interval = 1000 / rateHz;
  const times: number[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i * interval;
    times.push(rounding === 'integer' ? Math.round(t) : t);
  }
  return times;
}

describe('FPS cap cadence', () => {
  async function deliveriesFor(
    fps: number | undefined,
    times: number[],
  ): Promise<number[]> {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    const delivered: number[] = [];
    const ticker = createTicker({ fps, onTick: (f) => delivered.push(f.time) });
    ticker.start();
    for (const t of times) raf.frame(t);
    ticker.stop();
    return delivered;
  }

  it('a nominal 60fps cap on integer-rounded 60Hz timestamps does not fall to ~30fps', async () => {
    // 10 seconds of integer-rounded 60Hz rAF timestamps (Chromium-style).
    const times = sourceStream(60, 600, 'integer');
    const delivered = await deliveriesFor(60, times);
    // Within one source-frame boundary of the 60fps cap over the stream.
    expect(delivered.length).toBeGreaterThanOrEqual(598);
    expect(delivered.length).toBeLessThanOrEqual(600);
  });

  const sources = [30, 60, 120, 144] as const;
  const caps = [30, 50, 60, 120] as const;
  const roundings = ['fractional', 'integer'] as const;
  const matrix: Array<{
    source: number;
    cap: number;
    rounding: 'fractional' | 'integer';
  }> = [];
  for (const source of sources) {
    for (const cap of caps) {
      for (const rounding of roundings) matrix.push({ source, cap, rounding });
    }
  }

  it.each(matrix)(
    'long-run cadence: $cap fps cap on $rounding $source Hz source',
    async ({ source, cap, rounding }) => {
      const seconds = 10;
      const times = sourceStream(source, source * seconds, rounding);
      const delivered = await deliveriesFor(cap, times);

      const capInterval = 1000 / cap;
      const sourceInterval = 1000 / source;
      const first = delivered[0] as number;
      const last = times.at(-1) as number;

      // The first source frame always delivers and anchors the cadence grid.
      expect(first).toBe(times[0]);

      // Delivery count: exactly the cap's grid over the stream, bounded by
      // source cadence, within one source-frame boundary.
      const gridCount = Math.floor((last - first) / capInterval) + 1;
      const expected = Math.min(times.length, gridCount);
      expect(Math.abs(delivered.length - expected)).toBeLessThanOrEqual(1);

      // Never exceed source cadence, at most once per source callback.
      expect(delivered.length).toBeLessThanOrEqual(times.length);
      expect(new Set(delivered).size).toBe(delivered.length);

      // Timestamps: every delivery stays near its anchored grid slot. Late
      // source frames retain the deadline residual, so deviation from the
      // grid never accumulates (no cumulative downward drift).
      if (cap <= source) {
        for (let k = 0; k < delivered.length; k++) {
          const deviation =
            (delivered[k] as number) - (first + k * capInterval);
          expect(deviation).toBeGreaterThanOrEqual(-0.501);
          expect(deviation).toBeLessThan(capInterval + sourceInterval);
        }
      }
    },
  );

  it('a cap above source cadence delivers every source frame', async () => {
    const times = sourceStream(60, 300, 'fractional');
    const delivered = await deliveriesFor(120, times);
    expect(delivered).toEqual(times);
  });

  it('a long stall forfeits missed slots instead of bursting to catch up', async () => {
    // 1s of 60Hz frames, a 2s stall, then 1s more.
    const before = sourceStream(60, 60, 'fractional');
    const gap = 2000;
    const after = sourceStream(60, 60, 'fractional').map((t) => t + 1000 + gap);
    const delivered = await deliveriesFor(50, [...before, ...after]);
    // No catch-up burst: deliveries after the stall pace at the cap, so the
    // total stays near 2 seconds worth of 50fps (+1 for the resync frame),
    // not 4 seconds worth.
    expect(delivered.length).toBeLessThanOrEqual(102);
    expect(delivered.length).toBeGreaterThanOrEqual(98);
  });
});

// ---------------------------------------------------------------------------
// setFps
// ---------------------------------------------------------------------------

describe('setFps', () => {
  function stubRaf() {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    return raf;
  }

  it('changes the delivered cadence while running', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const delivered: number[] = [];
    const ticker = createTicker({ onTick: (f) => delivered.push(f.time) });
    ticker.start();
    // Uncapped: every 60Hz source frame delivers.
    for (let i = 1; i <= 60; i++) raf.frame(i * (1000 / 60));
    const uncapped = delivered.length;
    expect(uncapped).toBe(60);

    ticker.setFps(30);
    for (let i = 61; i <= 120; i++) raf.frame(i * (1000 / 60));
    const capped = delivered.length - uncapped;
    expect(capped).toBeGreaterThanOrEqual(29);
    expect(capped).toBeLessThanOrEqual(31);
    ticker.stop();
  });

  it('preserves FrameState identity, frame count, and elapsed across mutation', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const refs: unknown[] = [];
    const frames: number[] = [];
    const elapsed: number[] = [];
    const ticker = createTicker({
      fps: 60,
      onTick: (f) => {
        refs.push(f);
        frames.push(f.frame);
        elapsed.push(f.elapsed);
      },
    });
    ticker.start();
    for (let i = 1; i <= 30; i++) raf.frame(i * (1000 / 60));
    const framesBefore = frames.at(-1) as number;
    const elapsedBefore = elapsed.at(-1) as number;

    ticker.setFps(30);
    for (let i = 31; i <= 60; i++) raf.frame(i * (1000 / 60));

    // Same reused FrameState object across the mutation.
    expect(new Set(refs).size).toBe(1);
    // Frame count continues without reset, incrementing by exactly 1.
    expect(frames.at(-1)).toBeGreaterThan(framesBefore);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]).toBe((frames[i - 1] as number) + 1);
    }
    // Elapsed is nondecreasing and does not restart near zero.
    expect(elapsed[frames.indexOf(framesBefore + 1)]).toBeGreaterThan(
      elapsedBefore,
    );
    ticker.stop();
  });

  it('raising the cap takes effect next eligible frame without an uncapped transition frame', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const delivered: number[] = [];
    const ticker = createTicker({
      fps: 30,
      onTick: (f) => delivered.push(f.time),
    });
    ticker.start();
    // 120Hz source so sub-cap frames exist between eligible ones.
    const step = 1000 / 120;
    let i = 1;
    for (; i <= 120; i++) raf.frame(i * step);
    const lastBefore = delivered.at(-1) as number;

    ticker.setFps(60);
    for (; i <= 240; i++) raf.frame(i * step);

    const firstAfter = delivered.find((t) => t > lastBefore) as number;
    // Not sooner than the NEW cap allows relative to the last delivery.
    expect(firstAfter - lastBefore).toBeGreaterThanOrEqual(1000 / 60 - 0.001);
    ticker.stop();
  });

  it('lowering the cap defers the next delivery to the new interval', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const delivered: number[] = [];
    const ticker = createTicker({
      fps: 60,
      onTick: (f) => delivered.push(f.time),
    });
    ticker.start();
    const step = 1000 / 60;
    let i = 1;
    for (; i <= 60; i++) raf.frame(i * step);
    const lastBefore = delivered.at(-1) as number;

    ticker.setFps(30);
    for (; i <= 120; i++) raf.frame(i * step);

    const firstAfter = delivered.find((t) => t > lastBefore) as number;
    expect(firstAfter - lastBefore).toBeGreaterThanOrEqual(1000 / 30 - 0.001);
    ticker.stop();
  });

  it('mutation while paused applies on resume without resetting the timeline', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const frames: number[] = [];
    const times: number[] = [];
    const ticker = createTicker({
      fps: 60,
      onTick: (f) => {
        frames.push(f.frame);
        times.push(f.time);
      },
    });
    ticker.start();
    const step = 1000 / 60;
    let i = 1;
    for (; i <= 30; i++) raf.frame(i * step);
    ticker.pause();
    const framesBefore = frames.at(-1) as number;

    ticker.setFps(30);
    expect(ticker.phase).toBe('paused');
    ticker.resume();
    const countBefore = frames.length;
    for (; i <= 90; i++) raf.frame(i * step);

    // Frame count continues from where it left off.
    expect(frames[countBefore]).toBe(framesBefore + 1);
    // Post-resume cadence follows the new 30fps cap (first resumed frame
    // delivers immediately and re-anchors, then ~30/s).
    const after = frames.length - countBefore;
    expect(after).toBeGreaterThanOrEqual(29);
    expect(after).toBeLessThanOrEqual(31);
    ticker.stop();
  });

  it('mutation while idle applies from start', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const cb = vi.fn();
    const ticker = createTicker({ onTick: cb });
    ticker.setFps(30);
    ticker.start();
    for (let i = 1; i <= 60; i++) raf.frame(i * (1000 / 60));
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(cb.mock.calls.length).toBeLessThanOrEqual(31);
    ticker.stop();
  });

  it('setFps(undefined) uncaps, matching TickerOptions.fps', async () => {
    const raf = stubRaf();
    const { createTicker } = await getModule();
    const cb = vi.fn();
    const ticker = createTicker({ fps: 30, onTick: cb });
    ticker.start();
    for (let i = 1; i <= 60; i++) raf.frame(i * (1000 / 60));
    const capped = cb.mock.calls.length;

    ticker.setFps();
    for (let i = 61; i <= 120; i++) raf.frame(i * (1000 / 60));
    // Every source frame delivers once uncapped.
    expect(cb.mock.calls.length - capped).toBe(60);
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// Shared clock
// ---------------------------------------------------------------------------

describe('shared clock', () => {
  it('two tickers see the same timestamp', async () => {
    const { createTicker } = await getModule();
    let time1 = 0;
    let time2 = 0;
    const t1 = createTicker({
      onTick: (f) => {
        time1 = f.time;
      },
    });
    const t2 = createTicker({
      onTick: (f) => {
        time2 = f.time;
      },
    });
    t1.start();
    t2.start();
    advanceFrame(16);
    expect(time1).toBe(time2);
    expect(time1).toBeGreaterThan(0);
    t1.stop();
    t2.stop();
  });

  it('stopping one ticker does not stop the other', async () => {
    const { createTicker } = await getModule();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const t1 = createTicker({ onTick: cb1 });
    const t2 = createTicker({ onTick: cb2 });
    t1.start();
    t2.start();
    advanceFrame(16);
    t1.stop();
    advanceFrame(16);
    expect(cb2.mock.calls.length).toBeGreaterThan(cb1.mock.calls.length);
    t2.stop();
  });

  it('distributes the exact browser timestamp without a per-frame clock read', async () => {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const now = vi.spyOn(performance, 'now');
    const { createTicker } = await getModule();
    const times: number[] = [];
    const first = createTicker({ onTick: (frame) => times.push(frame.time) });
    const second = createTicker({ onTick: (frame) => times.push(frame.time) });
    first.start();
    second.start();
    now.mockClear();

    raf.frame(123.456);

    expect(times).toEqual([123.456, 123.456]);
    expect(now).not.toHaveBeenCalled();
    first.stop();
    second.stop();
  });

  it('defers a ticker started during dispatch until the next browser frame', async () => {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    const secondTick = vi.fn();
    const second = createTicker({ onTick: secondTick });
    const first = createTicker({ onTick: () => second.start() });
    first.start();

    raf.frame(10);
    expect(secondTick).not.toHaveBeenCalled();
    raf.frame(20);
    expect(secondTick).toHaveBeenCalledTimes(1);

    first.stop();
    second.stop();
  });

  it('does not redeliver a ticker paused and resumed during dispatch', async () => {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    let ticker: ReturnType<typeof createTicker>;
    let reenter = true;
    const callback = vi.fn(() => {
      if (!reenter) return;
      reenter = false;
      ticker.pause();
      ticker.resume();
    });
    ticker = createTicker({ onTick: callback });
    ticker.start();

    raf.frame(10);
    expect(callback).toHaveBeenCalledTimes(1);
    raf.frame(20);
    expect(callback).toHaveBeenCalledTimes(2);
    ticker.stop();
  });

  it('suppresses a later subscriber removed during dispatch', async () => {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    const secondTick = vi.fn();
    const second = createTicker({ onTick: secondTick });
    const first = createTicker({ onTick: () => second.pause() });
    first.start();
    second.start();

    raf.frame(10);

    expect(secondTick).not.toHaveBeenCalled();
    first.stop();
    second.stop();
  });

  it('cancels a pending frame whose request ID is zero', async () => {
    const raf = createRafDriver(0);
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    const ticker = createTicker({ onTick: vi.fn() });
    ticker.start();

    ticker.stop();

    expect(raf.cancel).toHaveBeenCalledWith(0);
    expect(raf.pending.size).toBe(0);
  });

  it('cancels the already scheduled next frame when the last ticker stops during dispatch', async () => {
    const raf = createRafDriver(0, 0);
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    let ticker: ReturnType<typeof createTicker>;
    ticker = createTicker({ onTick: () => ticker.stop() });
    ticker.start();

    raf.frame(10);

    expect(raf.cancel).toHaveBeenCalledWith(0);
    expect(raf.pending.size).toBe(0);
  });

  it('keeps the next frame scheduled after a one-time callback error', async () => {
    const raf = createRafDriver();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    const { createTicker } = await getModule();
    let shouldThrow = true;
    const callback = vi.fn(() => {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error('consumer failure');
      }
    });
    const ticker = createTicker({ onTick: callback });
    ticker.start();

    expect(() => raf.frame(10)).toThrow('consumer failure');
    expect(raf.pending.size).toBe(1);
    raf.frame(20);
    expect(callback).toHaveBeenCalledTimes(2);
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// Rapid lifecycle
// ---------------------------------------------------------------------------

describe('rapid lifecycle', () => {
  it('start/stop/start throws (stopped is terminal)', async () => {
    const { createTicker } = await getModule();
    const ticker = createTicker({ onTick: vi.fn() });
    ticker.start();
    ticker.stop();
    expect(() => ticker.start()).toThrow();
  });

  it('start/pause/resume cycles cleanly', async () => {
    const { createTicker } = await getModule();
    const cb = vi.fn();
    const ticker = createTicker({ onTick: cb });
    ticker.start();
    advanceFrame(16);
    ticker.pause();
    ticker.resume();
    advanceFrame(16);
    ticker.pause();
    ticker.resume();
    advanceFrame(16);
    expect(ticker.phase).toBe('running');
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3);
    ticker.stop();
  });

  it('multiple pause() calls are idempotent', async () => {
    const { createTicker } = await getModule();
    const ticker = createTicker({ onTick: vi.fn() });
    ticker.start();
    ticker.pause();
    expect(() => {
      ticker.pause();
      ticker.pause();
    }).not.toThrow();
    expect(ticker.phase).toBe('paused');
    ticker.stop();
  });
});

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

describe('abort signal', () => {
  it('aborting the signal stops the ticker', async () => {
    const { createTicker } = await getModule();
    const cb = vi.fn();
    const controller = new AbortController();
    const ticker = createTicker({ onTick: cb, signal: controller.signal });
    ticker.start();
    advanceFrame(16);
    expect(cb).toHaveBeenCalledTimes(1);

    controller.abort();
    expect(ticker.phase).toBe('stopped');

    cb.mockClear();
    advanceFrame(16);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stops immediately when the signal is already aborted', async () => {
    const { createTicker } = await getModule();
    const ticker = createTicker({
      onTick: vi.fn(),
      signal: AbortSignal.abort(),
    });
    expect(ticker.phase).toBe('stopped');
  });
});

describe('SSR', () => {
  it('throws when requestAnimationFrame is undefined', async () => {
    const origRaf = globalThis.requestAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.resetModules();
    const { createTicker } = await import('.');
    expect(() => createTicker({ onTick: vi.fn() })).toThrow();
    vi.stubGlobal('requestAnimationFrame', origRaf);
  });
});
