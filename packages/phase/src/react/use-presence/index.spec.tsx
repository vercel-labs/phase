import { renderHook, act } from '@testing-library/react';

import { createMockMatchMedia } from '../../__mocks__/match-media';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.usePresence;
}

type UsePresenceOptions = import('.').UsePresenceOptions;

// ---------------------------------------------------------------------------
// Initial mount
// ---------------------------------------------------------------------------

describe('initial mount', () => {
  it('show=false starts at idle, unmounted', async () => {
    const usePresence = await getHook();
    const { result } = renderHook(() => usePresence({ show: false }));
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
    expect(result.current.mounted).toBe(false);
  });

  it('show=true starts at entered immediately (no entering phase)', async () => {
    const usePresence = await getHook();
    const { result } = renderHook(() => usePresence({ show: true }));
    expect(result.current.phase).toBe('entered');
    expect(result.current.phaseReason).toBe('initial');
    expect(result.current.mounted).toBe(true);
  });

  it('show=true, enter=animate → enter field is animate', async () => {
    const usePresence = await getHook();
    const { result } = renderHook(() =>
      usePresence({ show: true, enter: 'animate' }),
    );
    expect(result.current.enter).toBe('animate');
  });

  it('show=true, enter=instant → enter field is instant', async () => {
    const usePresence = await getHook();
    const { result } = renderHook(() =>
      usePresence({ show: true, enter: 'instant' }),
    );
    expect(result.current.enter).toBe('instant');
  });

  it('show=true, enter=animate + reduced motion → enter field is instant', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePresence = await getHook();
    const { result } = renderHook(() =>
      usePresence({ show: true, enter: 'animate' }),
    );
    expect(result.current.enter).toBe('instant');
  });

  it('show=true, enter=animate + reduced motion + reducedMotion=ignore → enter field is animate', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePresence = await getHook();
    const { result } = renderHook(() =>
      usePresence({ show: true, enter: 'animate', reducedMotion: 'ignore' }),
    );
    expect(result.current.enter).toBe('animate');
  });
});

// ---------------------------------------------------------------------------
// Enter (show: false → true)
// ---------------------------------------------------------------------------

describe('enter (show: false → true)', () => {
  it('transitions idle → entered immediately', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: false } } },
    );
    expect(result.current.phase).toBe('idle');

    rerender({ options: { show: true } });
    expect(result.current.phase).toBe('entered');
    expect(result.current.phaseReason).toBe('show');
    expect(result.current.mounted).toBe(true);
  });

  it('enter field becomes animate after show transition', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: false } } },
    );

    rerender({ options: { show: true } });
    expect(result.current.enter).toBe('animate');
  });

  it('enter field is instant during show transition when reduced motion active', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: false } } },
    );

    rerender({ options: { show: true } });
    expect(result.current.enter).toBe('instant');
  });
});

// ---------------------------------------------------------------------------
// Exit (show: true → false)
// ---------------------------------------------------------------------------

describe('exit (show: true → false)', () => {
  it('transitions entered → exiting → exited via timeout', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true } } },
    );
    expect(result.current.phase).toBe('entered');

    rerender({ options: { show: false } });
    expect(result.current.phase).toBe('exiting');
    expect(result.current.phaseReason).toBe('hide');
    expect(result.current.mounted).toBe(true);

    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.phase).toBe('exited');
    expect(result.current.phaseReason).toBe('animation-end');
    expect(result.current.mounted).toBe(false);
  });

  it('uses custom exitDuration for timeout', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true, exitDuration: 200 } } },
    );

    rerender({ options: { show: false, exitDuration: 200 } });
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(199));
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.phase).toBe('exited');
  });
});

// ---------------------------------------------------------------------------
// Exit + reduced motion
// ---------------------------------------------------------------------------

describe('exit + reduced motion', () => {
  it('skips directly to exited when reduced motion is active', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true } } },
    );

    rerender({ options: { show: false } });
    expect(result.current.phase).toBe('exited');
    expect(result.current.phaseReason).toBe('animation-end');
    expect(result.current.mounted).toBe(false);
  });

  it('does NOT skip exit when reducedMotion=ignore', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      {
        initialProps: {
          options: { show: true, reducedMotion: 'ignore' },
        },
      },
    );

    rerender({ options: { show: false, reducedMotion: 'ignore' } });
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.phase).toBe('exited');
  });
});

// ---------------------------------------------------------------------------
// Reveal mode
// ---------------------------------------------------------------------------

describe('reveal mode', () => {
  it('exits to idle instead of exited', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true, mode: 'reveal' } } },
    );
    expect(result.current.phase).toBe('entered');

    rerender({ options: { show: false, mode: 'reveal' } });
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.phase).toBe('idle');
    expect(result.current.mounted).toBe(false);
  });

  it('reveal mode + reduced motion exits to idle immediately', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true, mode: 'reveal' } } },
    );

    rerender({ options: { show: false, mode: 'reveal' } });
    expect(result.current.phase).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Interrupts
// ---------------------------------------------------------------------------

describe('interrupts', () => {
  it('show true→false→true interrupts exit and goes directly to entered', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true } } },
    );

    rerender({ options: { show: false } });
    expect(result.current.phase).toBe('exiting');

    rerender({ options: { show: true } });
    expect(result.current.phase).toBe('entered');
    expect(result.current.phaseReason).toBe('interrupted');
  });

  it('exit timers are cleared on interrupt', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true, exitDuration: 100 } } },
    );

    rerender({ options: { show: false, exitDuration: 100 } });
    expect(result.current.phase).toBe('exiting');

    rerender({ options: { show: true, exitDuration: 100 } });
    expect(result.current.phase).toBe('entered');

    // Advancing past exit duration should NOT change phase
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.phase).toBe('entered');
  });
});

// ---------------------------------------------------------------------------
// Mounted convenience
// ---------------------------------------------------------------------------

describe('mounted', () => {
  it('is true for entered and exiting', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: false } } },
    );
    expect(result.current.mounted).toBe(false);

    rerender({ options: { show: true } });
    expect(result.current.mounted).toBe(true); // entered

    rerender({ options: { show: false } });
    expect(result.current.mounted).toBe(true); // exiting
  });

  it('is false for idle and exited', async () => {
    const usePresence = await getHook();
    const { result, rerender } = renderHook(
      ({ options }: { options: UsePresenceOptions }) => usePresence(options),
      { initialProps: { options: { show: true } } },
    );

    rerender({ options: { show: false } });
    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.phase).toBe('exited');
    expect(result.current.mounted).toBe(false);
  });
});
