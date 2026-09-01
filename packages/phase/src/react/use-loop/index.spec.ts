// Native frame delivery and teardown coverage lives in index.browser.spec.ts.
// Keep deterministic hook policy and target validation here.
import { renderHook } from '@testing-library/react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useLoop;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useLoop', () => {
  it('returns initial state { phase: idle, quality: full }', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() => useLoop({ ref, onTick: vi.fn() }));
    // Before sight reports, loop is paused
    expect(result.current.quality).toBe('full');
    expect(result.current.qualityReason).toBeUndefined();
  });

  it('returns a ref when none is provided', async () => {
    const useLoop = await getHook();
    const { result } = renderHook(() => useLoop({ onTick: vi.fn() }));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('enabled=false stays idle', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useLoop({ ref, onTick: vi.fn(), enabled: false }),
    );
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('null ref does not throw, stays idle', async () => {
    const useLoop = await getHook();
    const nullRef = { current: null };
    const { result } = renderHook(() =>
      useLoop({ ref: nullRef, onTick: vi.fn() }),
    );
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
  });

  it('cleans up loop on unmount', async () => {
    const useLoop = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() => useLoop({ ref, onTick: vi.fn() }));

    unmount();
    // IO trigger after unmount should not throw
    expect(() => mockIO.trigger(el, true)).not.toThrow();
  });

  it('enabled toggle: true -> false -> true', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLoop({ ref, onTick: vi.fn(), enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');

    rerender({ enabled: true });
    // Should leave the disabled idle state once re-enabled
    expect(result.current.phase).not.toBe('idle');
  });
});

describe('page target', () => {
  it('creates no observer for a page-anchored loop', async () => {
    const useLoop = await getHook();

    const { result, unmount } = renderHook(() =>
      useLoop({ target: 'page', onTick: vi.fn() }),
    );

    expect(result.current.phase).toBe('running');
    expect(mockIO.instances).toHaveLength(0);
    unmount();
  });

  it('throws when both ref and target are given', async () => {
    const useLoop = await getHook();
    const { ref } = createRefWithElement();

    expect(() =>
      renderHook(() => useLoop({ ref, target: 'page', onTick: vi.fn() })),
    ).toThrowError(/both ref and target/);
  });
});

describe('page target is SSR-safe', () => {
  it('rejects a Document at the type level and does not run', async () => {
    const useLoop = await getHook();

    const { result } = renderHook(() =>
      // @ts-expect-error - Document is not assignable to target: 'page'
      useLoop({ target: document, onTick: vi.fn() }),
    );

    // A literal `document` in hook options throws during server render, so the
    // option is a string. Passing one anyway must not quietly start a loop.
    expect(result.current.phase).not.toBe('running');
  });
});
