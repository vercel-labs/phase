import { render, screen, act } from '@testing-library/react';

import { Swap } from '.';

function flushDoubleRaf(): void {
  vi.advanceTimersByTime(32);
}

function flushExitTimeout(ms = 5000): void {
  vi.advanceTimersByTime(ms);
}

/** Get the Swap.State wrapper div (parent of the test content). Throws if missing. */
function getWrapper(testId: string): HTMLElement {
  const child = screen.getByTestId(testId);
  const parent = child.parentElement;
  if (!parent)
    throw new Error(`No parent element found for [data-testid="${testId}"]`);
  return parent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function SwapHarness({
  active,
  exitDuration,
}: {
  active: string;
  exitDuration?: number;
}) {
  return (
    <Swap active={active} exitDuration={exitDuration} data-testid="swap-root">
      <Swap.State id="a">
        <div data-testid="state-a">A</div>
      </Swap.State>
      <Swap.State id="b">
        <div data-testid="state-b">B</div>
      </Swap.State>
      <Swap.State id="c">
        <div data-testid="state-c">C</div>
      </Swap.State>
    </Swap>
  );
}

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

describe('initial render', () => {
  it('renders the active state immediately with no enter animation', () => {
    render(<SwapHarness active="a" />);
    expect(screen.getByTestId('state-a')).toBeTruthy();

    const wrapper = getWrapper('state-a');
    expect(wrapper.dataset.phase).toBe('entered');
  });

  it('does not render inactive states', () => {
    render(<SwapHarness active="a" />);
    expect(screen.queryByTestId('state-b')).toBeNull();
    expect(screen.queryByTestId('state-c')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exit-then-enter sequencing
// ---------------------------------------------------------------------------

describe('exit-then-enter sequencing', () => {
  it('fully exits A before entering B', () => {
    const { rerender } = render(<SwapHarness active="a" />);
    expect(screen.getByTestId('state-a')).toBeTruthy();

    rerender(<SwapHarness active="b" />);

    expect(screen.getByTestId('state-a')).toBeTruthy();
    const wrapperA = getWrapper('state-a');
    expect(wrapperA.dataset.phase).toBe('exiting');

    expect(screen.queryByTestId('state-b')).toBeNull();

    act(() => flushExitTimeout());

    expect(screen.queryByTestId('state-a')).toBeNull();
    expect(screen.getByTestId('state-b')).toBeTruthy();

    const wrapperB = getWrapper('state-b');
    expect(['entering', 'entered']).toContain(wrapperB.dataset.phase);

    act(() => flushDoubleRaf());
    expect(wrapperB.dataset.phase).toBe('entered');
  });
});

// ---------------------------------------------------------------------------
// Skip intermediate states (A→B→C during A's exit)
// ---------------------------------------------------------------------------

describe('skip intermediate', () => {
  it('A→B→C during exit skips B and goes to C', () => {
    const { rerender } = render(<SwapHarness active="a" />);

    rerender(<SwapHarness active="b" />);
    expect(screen.getByTestId('state-a')).toBeTruthy();
    expect(screen.queryByTestId('state-b')).toBeNull();

    rerender(<SwapHarness active="c" />);
    expect(screen.getByTestId('state-a')).toBeTruthy();
    expect(screen.queryByTestId('state-c')).toBeNull();

    act(() => flushExitTimeout());

    expect(screen.queryByTestId('state-a')).toBeNull();
    expect(screen.queryByTestId('state-b')).toBeNull();
    expect(screen.getByTestId('state-c')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Interrupt: A→B→A re-enters A
// ---------------------------------------------------------------------------

describe('interrupt', () => {
  it('A→B→A during exit re-enters A without unmounting', () => {
    const { rerender } = render(<SwapHarness active="a" />);

    rerender(<SwapHarness active="b" />);
    expect(screen.getByTestId('state-a')).toBeTruthy();
    const wrapperA = getWrapper('state-a');
    expect(wrapperA.dataset.phase).toBe('exiting');

    rerender(<SwapHarness active="a" />);

    expect(screen.getByTestId('state-a')).toBeTruthy();
    expect(wrapperA.dataset.phase).toBe('entering');

    act(() => flushDoubleRaf());
    expect(wrapperA.dataset.phase).toBe('entered');

    expect(screen.queryByTestId('state-b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Missing context
// ---------------------------------------------------------------------------

describe('missing context', () => {
  it('throws PhaseError when Swap.State is used outside Swap', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress React error boundary noise */
    });
    expect(() => {
      render(
        <Swap.State id="orphan">
          <div>orphan</div>
        </Swap.State>,
      );
    }).toThrow('<Swap.State> must be used inside <Swap>');
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Initial-skip-then-animate
// ---------------------------------------------------------------------------

describe('initial-skip-then-animate', () => {
  it('first active state renders with data-phase="entered" (no enter animation)', () => {
    render(<SwapHarness active="a" />);
    const wrapper = getWrapper('state-a');
    expect(wrapper.dataset.phase).toBe('entered');
  });

  it('after first swap completes, new state enters with animation', () => {
    const { rerender } = render(<SwapHarness active="a" />);

    // Swap to B — A exits
    rerender(<SwapHarness active="b" />);
    act(() => flushExitTimeout());

    // B should enter with animation (entering -> entered)
    const wrapperB = getWrapper('state-b');
    expect(['entering', 'entered']).toContain(wrapperB.dataset.phase);

    // Flush the enter animation
    act(() => flushDoubleRaf());
    expect(wrapperB.dataset.phase).toBe('entered');
  });
});
