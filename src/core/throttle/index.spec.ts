import { createThrottle } from '.';

let rafCallbacks: Array<FrameRequestCallback>;
let now: number;

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);

  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });

  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks[id - 1] = () => undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Advance the clock and run one frame's worth of queued rAF callbacks. */
function frame(deltaMs = 16): void {
  now += deltaMs;
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) cb(now);
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

// ---------------------------------------------------------------------------
// Leading edge
// ---------------------------------------------------------------------------

describe('leading edge', () => {
  it('fires the first call synchronously', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
    throttle.stop();
  });

  it('does not fire again inside the interval window', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1);
    now += 10;
    throttle.call(2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(throttle.pending).toBe(true);
    throttle.stop();
  });

  it('fires leading again once the window has expired', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      edge: 'leading',
    });

    throttle.call(1);
    now += 60;
    throttle.call(2);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(2);
    throttle.stop();
  });

  it('edge leading drops in-window calls without scheduling', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      edge: 'leading',
    });

    throttle.call(1);
    now += 10;
    throttle.call(2);
    expect(throttle.pending).toBe(false);
    expect(rafCallbacks.length).toBe(0);
    frame(60);
    expect(cb).toHaveBeenCalledTimes(1);
    throttle.stop();
  });
});

// ---------------------------------------------------------------------------
// Trailing edge
// ---------------------------------------------------------------------------

describe('trailing edge', () => {
  it('fires with the latest value on the first frame past the interval', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1); // leading
    throttle.call(2);
    throttle.call(3);
    expect(cb).toHaveBeenCalledTimes(1);

    frame(16); // 16ms elapsed — still inside the window, chain re-requests
    expect(cb).toHaveBeenCalledTimes(1);
    frame(16); // 32ms
    expect(cb).toHaveBeenCalledTimes(1);
    frame(32); // 64ms — past the interval
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(3);
    expect(throttle.pending).toBe(false);
    throttle.stop();
  });

  it('schedules no rAF while idle', async () => {
    const throttle = createThrottle<number>({
      callback: vi.fn(),
      interval: 50,
    });

    expect(rafCallbacks.length).toBe(0);
    throttle.call(1); // leading fire, nothing pending
    expect(rafCallbacks.length).toBe(0);
    throttle.stop();
  });

  it('edge trailing never fires synchronously', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      edge: 'trailing',
    });

    throttle.call(1);
    expect(cb).not.toHaveBeenCalled();
    frame(16);
    expect(cb).not.toHaveBeenCalled();
    frame(48); // 64ms since the window opened
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
    throttle.stop();
  });
});

// ---------------------------------------------------------------------------
// flush / cancel
// ---------------------------------------------------------------------------

describe('flush and cancel', () => {
  it('flush fires the pending call immediately', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1);
    throttle.call(2);
    throttle.flush();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(2);
    expect(throttle.pending).toBe(false);
    throttle.stop();
  });

  it('flush is a no-op when nothing is pending', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.flush();
    expect(cb).not.toHaveBeenCalled();
    throttle.stop();
  });

  it('cancel discards the pending call and resets the window', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1);
    throttle.call(2);
    throttle.cancel();
    expect(throttle.pending).toBe(false);
    frame(60);
    expect(cb).toHaveBeenCalledTimes(1);

    // Window was reset: the next call fires leading immediately.
    throttle.call(3);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(3);
    throttle.stop();
  });
});

// ---------------------------------------------------------------------------
// Document visibility
// ---------------------------------------------------------------------------

describe('document visibility', () => {
  it('flushes a pending call when the document hides (default)', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1);
    throttle.call(2);
    expect(cb).toHaveBeenCalledTimes(1);

    setDocumentHidden(true);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(2);
    throttle.stop();
  });

  it('drops a pending call when hidden is drop', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      hidden: 'drop',
    });

    throttle.call(1);
    throttle.call(2);
    setDocumentHidden(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(throttle.pending).toBe(false);
    throttle.stop();
  });

  it('defers calls made while hidden until visible again', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    setDocumentHidden(true);
    throttle.call(1);
    throttle.call(2);
    expect(cb).not.toHaveBeenCalled();
    expect(rafCallbacks.length).toBe(0);
    expect(throttle.pending).toBe(true);

    now += 100;
    setDocumentHidden(false);
    frame(16);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2);
    throttle.stop();
  });

  it('resumes a pending call on bfcache restore', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      hidden: 'drop',
    });

    setDocumentHidden(true);
    throttle.call(1);

    now += 100;
    const pageShow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageShow, 'persisted', { value: true });
    window.dispatchEvent(pageShow);

    frame(16);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
    throttle.stop();
  });
});

// ---------------------------------------------------------------------------
// Stop / teardown
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('drops pending work and ignores further calls', async () => {
    const cb = vi.fn();
    const throttle = createThrottle<number>({ callback: cb, interval: 50 });

    throttle.call(1);
    throttle.call(2);
    throttle.stop();
    expect(throttle.pending).toBe(false);

    throttle.call(3);
    throttle.flush();
    frame(60);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stop is idempotent', async () => {
    const throttle = createThrottle({ callback: vi.fn(), interval: 50 });
    throttle.stop();
    expect(() => throttle.stop()).not.toThrow();
  });

  it('aborting the signal stops the throttle', async () => {
    const cb = vi.fn();
    const controller = new AbortController();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      signal: controller.signal,
    });

    controller.abort();
    throttle.call(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('an already-aborted signal never subscribes', async () => {
    const cb = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const throttle = createThrottle<number>({
      callback: cb,
      interval: 50,
      signal: controller.signal,
    });

    throttle.call(1);
    expect(cb).not.toHaveBeenCalled();
    expect(throttle.pending).toBe(false);
  });
});
