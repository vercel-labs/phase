import { act, render } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createMockMatchMedia } from '@usephase/testing/match-media';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
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
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.useLifecycle;
}

function isObserved(element: Element): boolean {
  return mockIO.instances.some((instance) => instance.observed.has(element));
}

it('observes an element mounted after the first commit', async () => {
  const useLifecycle = await getHook();

  function Probe({ show }: { show: boolean }) {
    const { ref, isActive } = useLifecycle();
    return (
      <>
        <output data-testid="active">{String(isActive)}</output>
        {show ? <div ref={ref} data-testid="target" /> : null}
      </>
    );
  }

  const view = render(<Probe show={false} />);
  view.rerender(<Probe show />);
  const element = view.getByTestId('target');
  expect(isObserved(element)).toBe(true);

  act(() => mockIO.trigger(element, true));
  expect(view.getByTestId('active').textContent).toBe('true');
});

it('releases a keyed element and starts a new lifecycle', async () => {
  const useLifecycle = await getHook();
  const onPhaseChange = vi.fn();

  function Probe({ elementKey }: { elementKey: string }) {
    const { ref, phase, phaseReason, isActive } = useLifecycle({
      onPhaseChange,
    });
    return (
      <>
        <output data-testid="state">
          {phase}:{phaseReason}:{String(isActive)}
        </output>
        <div key={elementKey} ref={ref} data-testid="target" />
      </>
    );
  }

  const view = render(<Probe elementKey="first" />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  expect(view.getByTestId('state').textContent).toBe('active:started:true');

  view.rerender(<Probe elementKey="second" />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(first)).toBe(false);
  expect(isObserved(second)).toBe(true);
  expect(onPhaseChange).toHaveBeenCalledWith('stopped', 'disposed');
  expect(view.getByTestId('state').textContent).toBe('paused:sight:false');

  act(() => mockIO.trigger(second, true));
  expect(view.getByTestId('state').textContent).toBe('active:started:true');
});

it('resets on detach and observes a new element after re-expansion', async () => {
  const useLifecycle = await getHook();
  const onPhaseChange = vi.fn();

  function Probe({ show }: { show: boolean }) {
    const { ref, phase, phaseReason, isActive } = useLifecycle({
      onPhaseChange,
    });
    return (
      <>
        <output data-testid="state">
          {phase}:{phaseReason}:{String(isActive)}
        </output>
        {show ? <div ref={ref} data-testid="target" /> : null}
      </>
    );
  }

  const view = render(<Probe show />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  view.rerender(<Probe show={false} />);
  expect(isObserved(first)).toBe(false);
  expect(view.getByTestId('state').textContent).toBe('idle:initial:false');
  expect(onPhaseChange).toHaveBeenCalledWith('stopped', 'disposed');
  expect(mockMM.listenerCount('(prefers-reduced-motion: reduce)')).toBe(0);

  view.rerender(<Probe show />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(second)).toBe(true);
  act(() => mockIO.trigger(second, true));
  expect(view.getByTestId('state').textContent).toBe('active:started:true');
});

it('adds no reconciliation render on plain mount', async () => {
  const useLifecycle = await getHook();
  let renders = 0;

  function Probe() {
    renders++;
    const { ref } = useLifecycle();
    return <div ref={ref} />;
  }

  render(<Probe />, { reactStrictMode: false });
  // The core lifecycle reports its initial paused phase synchronously.
  expect(renders).toBe(2);
});

it('resets the page lifecycle when switching to an absent element', async () => {
  const useLifecycle = await getHook();

  function Probe({ target, show }: { target?: 'page'; show: boolean }) {
    const { ref, phase, phaseReason, isActive } = useLifecycle({ target });
    return (
      <>
        <output data-testid="state">
          {phase}:{phaseReason}:{String(isActive)}
        </output>
        {show ? <div ref={ref} data-testid="target" /> : null}
      </>
    );
  }

  const view = render(<Probe target="page" show={false} />);
  expect(view.getByTestId('state').textContent).toBe('active:started:true');
  expect(mockIO.instances).toHaveLength(0);

  view.rerender(<Probe show={false} />);
  expect(view.getByTestId('state').textContent).toBe('idle:initial:false');

  view.rerender(<Probe show />);
  const element = view.getByTestId('target');
  expect(isObserved(element)).toBe(true);
  act(() => mockIO.trigger(element, true));

  view.rerender(<Probe target="page" show={false} />);
  expect(isObserved(element)).toBe(false);
  expect(view.getByTestId('state').textContent).toBe('active:started:true');
});
