// Native DPR coverage lives in index.browser.spec.ts. Keep only deterministic
// policy and headless-unreachable DPR transitions here.
import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  vi.stubGlobal('devicePixelRatio', 2);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getFactory() {
  const mod = await import('.');
  return mod.createDevicePixelRatio;
}

describe('createDevicePixelRatio()', () => {
  it('throws on the server (no matchMedia)', async () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.resetModules();
    const createDevicePixelRatio = await getFactory();
    expect(() => createDevicePixelRatio({ onChange: vi.fn() })).toThrow();
  });

  it('calls onChange and updates dpr when DPR changes', async () => {
    const createDevicePixelRatio = await getFactory();
    const onChange = vi.fn();
    const watcher = createDevicePixelRatio({ onChange });

    vi.stubGlobal('devicePixelRatio', 3);
    mockMM.setMatches('(resolution: 2dppx)', false);

    expect(onChange).toHaveBeenCalledWith(3);
    expect(watcher.dpr).toBe(3);
    watcher.stop();
  });

  it('stop() unsubscribes — no further onChange calls', async () => {
    const createDevicePixelRatio = await getFactory();
    const onChange = vi.fn();
    const watcher = createDevicePixelRatio({ onChange });

    watcher.stop();

    vi.stubGlobal('devicePixelRatio', 3);
    mockMM.setMatches('(resolution: 2dppx)', false);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stop() is idempotent', async () => {
    const createDevicePixelRatio = await getFactory();
    const watcher = createDevicePixelRatio({ onChange: vi.fn() });
    watcher.stop();
    expect(() => watcher.stop()).not.toThrow();
  });

  it('aborting the signal stops the watcher', async () => {
    const createDevicePixelRatio = await getFactory();
    const onChange = vi.fn();
    const controller = new AbortController();
    createDevicePixelRatio({ onChange, signal: controller.signal });

    controller.abort();

    vi.stubGlobal('devicePixelRatio', 3);
    mockMM.setMatches('(resolution: 2dppx)', false);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not subscribe when the signal is already aborted', async () => {
    const createDevicePixelRatio = await getFactory();
    const onChange = vi.fn();
    createDevicePixelRatio({ onChange, signal: AbortSignal.abort() });

    vi.stubGlobal('devicePixelRatio', 3);
    mockMM.setMatches('(resolution: 2dppx)', false);

    expect(onChange).not.toHaveBeenCalled();
  });
});
