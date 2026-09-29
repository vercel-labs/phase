import { act, render } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createRef, type RefObject } from 'react';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
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
  return mod.useSight;
}

function isObserved(element: Element): boolean {
  return mockIO.instances.some((instance) => instance.observed.has(element));
}

it('observes an element mounted after the first commit', async () => {
  const useSight = await getHook();

  function Probe({ show }: { show: boolean }) {
    const { ref, phase } = useSight();
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
  expect(view.getByTestId('phase').textContent).toBe('visible');
});

it('moves observation to a keyed replacement and resets phase and refs', async () => {
  const useSight = await getHook();
  let phaseRef: ReturnType<typeof useSight>['phaseRef'] | undefined;
  let reasonRef: ReturnType<typeof useSight>['phaseReasonRef'] | undefined;

  function Probe({ elementKey }: { elementKey: string }) {
    const sight = useSight();
    phaseRef = sight.phaseRef;
    reasonRef = sight.phaseReasonRef;
    return (
      <>
        <output data-testid="phase">
          {sight.phase}:{sight.phaseReason}
        </output>
        <div key={elementKey} ref={sight.ref} data-testid="target" />
      </>
    );
  }

  const view = render(<Probe elementKey="first" />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  expect(view.getByTestId('phase').textContent).toBe('visible:viewport');

  view.rerender(<Probe elementKey="second" />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(first)).toBe(false);
  expect(isObserved(second)).toBe(true);
  expect(view.getByTestId('phase').textContent).toBe('unknown:initial');
  expect(phaseRef?.current).toBe('unknown');
  expect(reasonRef?.current).toBe('initial');

  act(() => mockIO.trigger(second, true));
  expect(view.getByTestId('phase').textContent).toBe('visible:viewport');
});

it('keeps phase when a new ref object points to the same element', async () => {
  const useSight = await getHook();
  const firstRef = createRef<HTMLDivElement>();
  const secondRef = createRef<HTMLDivElement>();

  function Probe({
    targetRef,
  }: {
    targetRef: RefObject<HTMLDivElement | null>;
  }) {
    const { phase, phaseReason } = useSight({ ref: targetRef });
    return (
      <>
        <output data-testid="phase">
          {phase}:{phaseReason}
        </output>
        <div ref={targetRef} data-testid="target" />
      </>
    );
  }

  const view = render(<Probe targetRef={firstRef} />);
  const element = view.getByTestId('target');
  act(() => mockIO.trigger(element, true));
  expect(view.getByTestId('phase').textContent).toBe('visible:viewport');

  view.rerender(<Probe targetRef={secondRef} />);
  expect(view.getByTestId('target')).toBe(element);
  expect(isObserved(element)).toBe(true);
  expect(view.getByTestId('phase').textContent).toBe('visible:viewport');
});

it('resets on detach and observes a new element after re-expansion', async () => {
  const useSight = await getHook();

  function Probe({ show }: { show: boolean }) {
    const { ref, phase, phaseReason } = useSight();
    return (
      <>
        <output data-testid="phase">
          {phase}:{phaseReason}
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
  expect(view.getByTestId('phase').textContent).toBe('unknown:initial');

  view.rerender(<Probe show />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(second)).toBe(true);
});

it('resets transient refs without a synthetic visibility callback', async () => {
  const useSight = await getHook();
  const onVisibilityChange = vi.fn();
  let currentPhase: (() => string) | undefined;
  let renders = 0;

  function Probe({ elementKey }: { elementKey: string }) {
    renders++;
    const sight = useSight({ onVisibilityChange });
    currentPhase = () => sight.phaseRef.current;
    return <div key={elementKey} ref={sight.ref} data-testid="target" />;
  }

  const view = render(<Probe elementKey="first" />, {
    reactStrictMode: false,
  });
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  expect(currentPhase?.()).toBe('visible');
  expect(onVisibilityChange).toHaveBeenCalledTimes(1);
  const rendersBeforeSwap = renders;

  view.rerender(<Probe elementKey="second" />);
  expect(renders).toBe(rendersBeforeSwap + 2);
  expect(currentPhase?.()).toBe('unknown');
  expect(onVisibilityChange).toHaveBeenCalledTimes(1);

  const second = view.getByTestId('target');
  act(() => mockIO.trigger(second, true));
  expect(onVisibilityChange).toHaveBeenCalledTimes(2);
});

it('resets an earlier reactive phase when a transient callback is added', async () => {
  const useSight = await getHook();
  const onVisibilityChange = vi.fn();

  function Probe({
    elementKey,
    callback,
  }: {
    elementKey: string;
    callback?: typeof onVisibilityChange;
  }) {
    const { ref, phase, phaseReason } = useSight({
      onVisibilityChange: callback,
    });
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
  act(() => mockIO.trigger(view.getByTestId('target'), true));
  expect(view.getByTestId('phase').textContent).toBe('visible:viewport');

  view.rerender(<Probe elementKey="second" callback={onVisibilityChange} />);
  expect(view.getByTestId('phase').textContent).toBe('unknown:initial');
  expect(onVisibilityChange).not.toHaveBeenCalled();
});

it('adds no reconciliation render on plain mount', async () => {
  const useSight = await getHook();
  let renders = 0;

  function Probe() {
    renders++;
    const { ref } = useSight();
    return <div ref={ref} />;
  }

  render(<Probe />, { reactStrictMode: false });
  expect(renders).toBe(1);
});

it('resets the page phase when switching to an absent element', async () => {
  const useSight = await getHook();

  function Probe({ target, show }: { target?: 'page'; show: boolean }) {
    const { ref, phase, phaseReason } = useSight({ target });
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
  expect(view.getByTestId('phase').textContent).toBe('visible:initial');
  expect(mockIO.instances).toHaveLength(0);

  view.rerender(<Probe show={false} />);
  expect(view.getByTestId('phase').textContent).toBe('unknown:initial');

  view.rerender(<Probe show />);
  const element = view.getByTestId('target');
  expect(isObserved(element)).toBe(true);
  act(() => mockIO.trigger(element, true));

  view.rerender(<Probe target="page" show={false} />);
  expect(isObserved(element)).toBe(false);
  expect(view.getByTestId('phase').textContent).toBe('visible:initial');
});
