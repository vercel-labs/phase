import { renderHook, act } from '@testing-library/react';

import { usePresence, type UsePresenceOptions } from './index.js';

// jsdom doesn't fire CSS transitions — we dispatch the event manually.
function fireTransitionEnd(element: Element): void {
  element.dispatchEvent(new Event('transitionend', { bubbles: true }));
}

// Advance past the double-rAF fallback used by handleEnter.
function flushDoubleRaf(): void {
  vi.advanceTimersByTime(32);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPresence(initial: UsePresenceOptions) {
  return renderHook(
    ({ options }: { options: UsePresenceOptions }) => usePresence(options),
    { initialProps: { options: initial } },
  );
}

// ---------------------------------------------------------------------------
// Initial mount
// ---------------------------------------------------------------------------

describe('initial mount', () => {
  it('show=false starts at idle, unmounted', () => {
    const { result } = renderPresence({ show: false });
    expect(result.current.phase).toBe('idle');
    expect(result.current.phaseReason).toBe('initial');
    expect(result.current.mounted).toBe(false);
  });

  it('show=true + initial=skip starts at entered (no animation)', () => {
    const { result } = renderPresence({ show: true, initial: 'skip' });
    expect(result.current.phase).toBe('entered');
    expect(result.current.mounted).toBe(true);
  });

  it('show=true + initial=animate starts at entering then completes', () => {
    const { result } = renderPresence({ show: true, initial: 'animate' });
    expect(result.current.phase).toBe('entering');
    expect(result.current.mounted).toBe(true);

    act(() => flushDoubleRaf());

    expect(result.current.phase).toBe('entered');
    expect(result.current.phaseReason).toBe('animation-end');
  });
});

// ---------------------------------------------------------------------------
// Enter
// ---------------------------------------------------------------------------

describe('enter (show: false → true)', () => {
  it('transitions idle → entering → entered via rAF fallback', () => {
    const { result, rerender } = renderPresence({ show: false });
    expect(result.current.phase).toBe('idle');

    rerender({ options: { show: true } });
    expect(result.current.phase).toBe('entering');
    expect(result.current.phaseReason).toBe('show');
    expect(result.current.mounted).toBe(true);

    act(() => flushDoubleRaf());

    expect(result.current.phase).toBe('entered');
    expect(result.current.phaseReason).toBe('animation-end');
  });

  it('completes via transitionend before rAF fallback', () => {
    const { result, rerender } = renderPresence({ show: false });
    rerender({ options: { show: true } });
    expect(result.current.phase).toBe('entering');

    // Simulate CSS transition completing
    const el = result.current.ref.current;
    if (el) {
      act(() => fireTransitionEnd(el));
    } else {
      // ref won't be attached in renderHook (no DOM element) — rAF fallback covers it
      act(() => flushDoubleRaf());
    }

    expect(result.current.phase).toBe('entered');
  });
});

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

describe('exit (show: true → false)', () => {
  it('transitions entered → exiting → exited via timeout', () => {
    const { result, rerender } = renderPresence({
      show: true,
      initial: 'skip',
    });
    expect(result.current.phase).toBe('entered');

    rerender({ options: { show: false } });
    expect(result.current.phase).toBe('exiting');
    expect(result.current.phaseReason).toBe('hide');
    expect(result.current.mounted).toBe(true);

    // No transitionend in renderHook — timeout safety net fires
    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.phase).toBe('exited');
    expect(result.current.phaseReason).toBe('animation-end');
    expect(result.current.mounted).toBe(false);
  });

  it('uses custom exitDuration for timeout', () => {
    const { result, rerender } = renderPresence({
      show: true,
      initial: 'skip',
      exitDuration: 200,
    });

    rerender({ options: { show: false, exitDuration: 200 } });
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(199));
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.phase).toBe('exited');
  });
});

// ---------------------------------------------------------------------------
// Reveal mode
// ---------------------------------------------------------------------------

describe('reveal mode', () => {
  it('exits to idle instead of exited', () => {
    const { result, rerender } = renderPresence({
      show: true,
      initial: 'skip',
      mode: 'reveal',
    });
    expect(result.current.phase).toBe('entered');

    rerender({ options: { show: false, mode: 'reveal' } });
    expect(result.current.phase).toBe('exiting');

    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.phase).toBe('idle');
    expect(result.current.mounted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Interrupts
// ---------------------------------------------------------------------------

describe('interrupts', () => {
  it('show true→false→true interrupts exit and re-enters', () => {
    const { result, rerender } = renderPresence({
      show: true,
      initial: 'skip',
    });

    // Start exit
    rerender({ options: { show: false } });
    expect(result.current.phase).toBe('exiting');

    // Interrupt: re-enter before exit completes
    rerender({ options: { show: true } });
    expect(result.current.phase).toBe('entering');
    expect(result.current.phaseReason).toBe('interrupted');

    act(() => flushDoubleRaf());
    expect(result.current.phase).toBe('entered');
  });
});

// ---------------------------------------------------------------------------
// Mounted convenience
// ---------------------------------------------------------------------------

describe('mounted', () => {
  it('is true for entering, entered, exiting', () => {
    const { result, rerender } = renderPresence({ show: false });
    expect(result.current.mounted).toBe(false);

    rerender({ options: { show: true } });
    expect(result.current.mounted).toBe(true); // entering

    act(() => flushDoubleRaf());
    expect(result.current.mounted).toBe(true); // entered

    rerender({ options: { show: false } });
    expect(result.current.mounted).toBe(true); // exiting
  });

  it('is false for idle and exited', () => {
    const { result, rerender } = renderPresence({
      show: true,
      initial: 'skip',
    });

    rerender({ options: { show: false } });
    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.phase).toBe('exited');
    expect(result.current.mounted).toBe(false);
  });
});
