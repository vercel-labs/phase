import { act, render } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createMockMatchMedia } from '@usephase/testing/match-media';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  vi.useFakeTimers();
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('matchMedia', createMockMatchMedia().mockMatchMedia);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useLoop;
}

function isObserved(element: Element): boolean {
  return mockIO.instances.some((instance) => instance.observed.has(element));
}

it('starts observing an element mounted after the first commit', async () => {
  const useLoop = await getHook();

  function Probe({ show }: { show: boolean }) {
    const { ref, phase } = useLoop({ onTick: vi.fn() });
    return (
      <>
        <output data-testid="phase">{phase}</output>
        {show ? <div ref={ref} data-testid="target" /> : null}
      </>
    );
  }

  const view = render(<Probe show={false} />);
  view.rerender(<Probe show />);
  const element = view.getByTestId('target');
  expect(isObserved(element)).toBe(true);

  act(() => mockIO.trigger(element, true));
  expect(view.getByTestId('phase').textContent).toBe('running');
});

it('stops the old loop and observes a keyed replacement', async () => {
  const useLoop = await getHook();
  const onTick = vi.fn();

  function Probe({ elementKey }: { elementKey: string }) {
    const { ref, phase, phaseReason } = useLoop({ onTick });
    return (
      <>
        <output data-testid="phase">
          {phase}:{phaseReason}
        </output>
        <div key={elementKey} ref={ref} data-testid="target" />
      </>
    );
  }

  const view = render(<Probe elementKey="first" />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  expect(view.getByTestId('phase').textContent).toBe('running:resumed');
  act(() => vi.advanceTimersByTime(16));
  expect(onTick).toHaveBeenCalled();

  view.rerender(<Probe elementKey="second" />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(first)).toBe(false);
  expect(isObserved(second)).toBe(true);
  expect(view.getByTestId('phase').textContent).toBe('paused:sight');
  const ticksAfterSwap = onTick.mock.calls.length;
  act(() => vi.advanceTimersByTime(32));
  expect(onTick).toHaveBeenCalledTimes(ticksAfterSwap);

  act(() => mockIO.trigger(second, true));
  expect(view.getByTestId('phase').textContent).toBe('running:resumed');
});

it('resets on detach and restarts after re-expansion', async () => {
  const useLoop = await getHook();
  const onTick = vi.fn();

  function Probe({ show }: { show: boolean }) {
    const { ref, phase, phaseReason, quality, qualityReason } = useLoop({
      onTick,
    });
    return (
      <>
        <output data-testid="state">
          {phase}:{phaseReason}:{quality}:{qualityReason ?? 'none'}
        </output>
        {show ? <div ref={ref} data-testid="target" /> : null}
      </>
    );
  }

  const view = render(<Probe show />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('blur')));
  act(() => mockIO.trigger(first, false));
  expect(view.getByTestId('state').textContent).toBe(
    'paused:sight:degraded:unfocused',
  );

  view.rerender(<Probe show={false} />);
  expect(isObserved(first)).toBe(false);
  expect(view.getByTestId('state').textContent).toBe('idle:initial:full:none');
  const ticksAfterDetach = onTick.mock.calls.length;
  act(() => vi.advanceTimersByTime(32));
  expect(onTick).toHaveBeenCalledTimes(ticksAfterDetach);

  view.rerender(<Probe show />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(second)).toBe(true);
  act(() => mockIO.trigger(second, true));
  expect(view.getByTestId('state').textContent).toBe(
    'running:resumed:full:none',
  );
});

it('adds no reconciliation render on plain mount', async () => {
  const useLoop = await getHook();
  let renders = 0;

  function Probe() {
    renders++;
    const { ref } = useLoop({ onTick: vi.fn() });
    return <div ref={ref} />;
  }

  render(<Probe />, { reactStrictMode: false });
  // The core loop reports its initial paused phase synchronously.
  expect(renders).toBe(2);
});

it('resets the page loop when switching to an absent element', async () => {
  const useLoop = await getHook();
  const onTick = vi.fn();

  function Probe({ target, show }: { target?: 'page'; show: boolean }) {
    const { ref, phase, phaseReason } = useLoop({ target, onTick });
    return (
      <>
        <output data-testid="phase">
          {phase}:{phaseReason}
        </output>
        {show ? <div ref={ref} data-testid="target" /> : null}
      </>
    );
  }

  const view = render(<Probe target="page" show={false} />);
  expect(view.getByTestId('phase').textContent).toBe('running:started');
  expect(mockIO.instances).toHaveLength(0);

  view.rerender(<Probe show={false} />);
  expect(view.getByTestId('phase').textContent).toBe('idle:initial');

  view.rerender(<Probe show />);
  const element = view.getByTestId('target');
  expect(isObserved(element)).toBe(true);
  act(() => mockIO.trigger(element, true));

  view.rerender(<Probe target="page" show={false} />);
  expect(isObserved(element)).toBe(false);
  expect(view.getByTestId('phase').textContent).toBe('running:started');
});
