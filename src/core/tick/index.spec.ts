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
