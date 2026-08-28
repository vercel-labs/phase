// Native scheduling coverage lives in index.browser.spec.ts. Keep only
// deterministic policy and headless-unreachable scenarios here.
import { createMockIdle } from '../../__mocks__/idle';

let mockIdle: ReturnType<typeof createMockIdle>;

beforeEach(() => {
  mockIdle = createMockIdle();
  vi.stubGlobal('requestIdleCallback', mockIdle.requestIdleCallback);
  vi.stubGlobal('cancelIdleCallback', mockIdle.cancelIdleCallback);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.useRealTimers();
});

async function getModule() {
  return import('.');
}

// ---------------------------------------------------------------------------
// requestIdleCallback path
// ---------------------------------------------------------------------------

describe('requestIdleCallback path', () => {
  it('forwards the timeout option', async () => {
    const { whenIdle } = await getModule();
    const spy = vi.spyOn(window, 'requestIdleCallback');

    whenIdle(vi.fn(), { timeout: 2000 });

    expect(spy).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
  });
});

// ---------------------------------------------------------------------------
// setTimeout fallback
// ---------------------------------------------------------------------------

describe('setTimeout fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
    vi.useFakeTimers();
  });

  it('runs the callback via setTimeout when requestIdleCallback is unavailable', async () => {
    const { whenIdle } = await getModule();
    const cb = vi.fn();

    whenIdle(cb);
    expect(cb).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Abort signal
// ---------------------------------------------------------------------------

describe('abort signal', () => {
  it('never schedules when the signal is already aborted', async () => {
    const { whenIdle } = await getModule();
    const cb = vi.fn();

    whenIdle(cb, { signal: AbortSignal.abort() });

    expect(mockIdle.pending).toBe(0);
    mockIdle.flush();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

describe('SSR guard', () => {
  it('throws when called without a window', async () => {
    vi.stubGlobal('window', undefined);
    const { whenIdle } = await getModule();

    expect(() => whenIdle(vi.fn())).toThrow(/server/i);
  });
});
