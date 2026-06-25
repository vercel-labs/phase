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
  it('runs the callback when idle', async () => {
    const { whenIdle } = await getModule();
    const cb = vi.fn();

    whenIdle(cb);
    expect(cb).not.toHaveBeenCalled();

    mockIdle.flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('forwards the timeout option', async () => {
    const { whenIdle } = await getModule();
    const spy = vi.spyOn(window, 'requestIdleCallback');

    whenIdle(vi.fn(), { timeout: 2000 });

    expect(spy).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
  });

  it('cancel prevents the callback', async () => {
    const { whenIdle } = await getModule();
    const cb = vi.fn();

    const cancel = whenIdle(cb);
    cancel();
    mockIdle.flush();

    expect(cb).not.toHaveBeenCalled();
    expect(mockIdle.pending).toBe(0);
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

  it('cancel clears the fallback timeout', async () => {
    const { whenIdle } = await getModule();
    const cb = vi.fn();

    const cancel = whenIdle(cb);
    cancel();
    vi.runAllTimers();

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
