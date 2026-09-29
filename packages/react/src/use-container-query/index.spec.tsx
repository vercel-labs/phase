// Native observer coverage lives in index.browser.spec.tsx. Keep only
// deterministic React wiring and headless-unreachable scenarios here.
import { render, renderHook, act } from '@testing-library/react';
import { createMockResizeObserver } from '@usephase/testing/resize-observer';
import { useRef } from 'react';

let mockRO: ReturnType<typeof createMockResizeObserver>;

beforeEach(() => {
  mockRO = createMockResizeObserver();
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useContainerQuery;
}

function createRefWithElement() {
  const el = document.createElement('div');
  return { ref: { current: el }, el };
}

describe('useContainerQuery', () => {
  it('returns false initially', async () => {
    const useContainerQuery = await getHook();
    const { ref } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery({ minWidth: 600 }, { ref }),
    );
    expect(result.current.matches).toBe(false);
  });

  it('returns a ref when none is provided', async () => {
    const useContainerQuery = await getHook();
    const { result } = renderHook(() => useContainerQuery({ minWidth: 600 }));
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('does NOT re-render when match result is unchanged', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useContainerQuery({ minWidth: 600 }, { ref });
    });

    act(() => mockRO.trigger(el, 800, 400));
    const countAfterMatch = renderCount;

    // Size changes but still above 600 — match unchanged
    act(() => mockRO.trigger(el, 900, 400));
    expect(renderCount).toBe(countAfterMatch);
  });

  it('supports multiple breakpoint constraints', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result } = renderHook(() =>
      useContainerQuery({ minWidth: 400, minHeight: 300 }, { ref }),
    );

    // Width ok, height too small
    act(() => mockRO.trigger(el, 500, 200));
    expect(result.current.matches).toBe(false);

    // Both ok
    act(() => mockRO.trigger(el, 500, 400));
    expect(result.current.matches).toBe(true);
  });

  it('cleans up on unmount', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { unmount } = renderHook(() =>
      useContainerQuery({ minWidth: 600 }, { ref }),
    );
    expect(mockRO.instances.some((instance) => instance.observed.has(el))).toBe(
      true,
    );

    unmount();
    expect(mockRO.instances.some((instance) => instance.observed.has(el))).toBe(
      false,
    );
  });

  it('breakpoint prop change re-evaluates immediately', async () => {
    const useContainerQuery = await getHook();
    const { ref, el } = createRefWithElement();
    const { result, rerender } = renderHook(
      ({ bp }: { bp: { minWidth: number } }) => useContainerQuery(bp, { ref }),
      { initialProps: { bp: { minWidth: 400 } } },
    );

    act(() => mockRO.trigger(el, 600, 400));
    expect(result.current.matches).toBe(true);

    // Change threshold to 800 — 600px element no longer matches
    rerender({ bp: { minWidth: 800 } });
    // The effect re-runs with new breakpoint, RO fires again
    act(() => mockRO.trigger(el, 600, 400));
    expect(result.current.matches).toBe(false);
  });

  it('observes an element mounted after the initial commit', async () => {
    const useContainerQuery = await getHook();

    function Probe({ show }: { show: boolean }) {
      const { ref, matches } = useContainerQuery({ minWidth: 600 });
      return (
        <>
          <output data-testid="matches">{String(matches)}</output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show={false} />);
    view.rerender(<Probe show />);
    const element = view.getByTestId('target');

    expect(mockRO.instances[0]?.observed).toContain(element);
    act(() => mockRO.trigger(element, 800, 400));
    expect(view.getByTestId('matches').textContent).toBe('true');
  });

  it('moves observation to a keyed replacement and keeps the last match until delivery', async () => {
    const useContainerQuery = await getHook();

    function Probe({ elementKey }: { elementKey: string }) {
      const ref = useRef<HTMLDivElement>(null);
      const { matches } = useContainerQuery({ minWidth: 600 }, { ref });
      return (
        <>
          <output data-testid="matches">{String(matches)}</output>
          <div key={elementKey} ref={ref} data-testid="target" />
        </>
      );
    }

    const view = render(<Probe elementKey="first" />);
    const first = view.getByTestId('target');
    act(() => mockRO.trigger(first, 800, 400));
    expect(view.getByTestId('matches').textContent).toBe('true');

    view.rerender(<Probe elementKey="second" />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    expect(view.getByTestId('matches').textContent).toBe('true');
    expect(mockRO.instances[0]?.observed).not.toContain(first);
    expect(mockRO.instances[0]?.observed).toContain(second);

    act(() => mockRO.trigger(second, 400, 400));
    expect(view.getByTestId('matches').textContent).toBe('false');
  });

  it('re-observes after collapse and re-expand', async () => {
    const useContainerQuery = await getHook();

    function Probe({ show }: { show: boolean }) {
      const { ref, matches } = useContainerQuery({ minWidth: 600 });
      return (
        <>
          <output data-testid="matches">{String(matches)}</output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show />);
    const first = view.getByTestId('target');
    act(() => mockRO.trigger(first, 800, 400));

    view.rerender(<Probe show={false} />);
    expect(view.getByTestId('matches').textContent).toBe('true');
    expect(mockRO.instances[0]?.observed).not.toContain(first);

    view.rerender(<Probe show />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    expect(mockRO.instances[0]?.observed).toContain(second);

    act(() => mockRO.trigger(second, 400, 400));
    expect(view.getByTestId('matches').textContent).toBe('false');
  });

  it('ignores a notification from an element no longer held by the ref', async () => {
    const useContainerQuery = await getHook();
    const first = document.createElement('div');
    const second = document.createElement('div');
    const ref = { current: first as HTMLDivElement | null };
    const { result } = renderHook(() =>
      useContainerQuery({ minWidth: 600 }, { ref }),
    );

    act(() => mockRO.trigger(first, 800, 400));
    expect(result.current.matches).toBe(true);

    ref.current = second;
    act(() => mockRO.trigger(first, 400, 400));
    expect(result.current.matches).toBe(true);
  });

  it('adds no reconciliation render on plain mount', async () => {
    const useContainerQuery = await getHook();
    let renders = 0;

    function Probe() {
      renders++;
      const { ref } = useContainerQuery({ minWidth: 600 });
      return <div ref={ref} />;
    }

    render(<Probe />, { reactStrictMode: false });
    expect(renders).toBe(1);
  });
});
