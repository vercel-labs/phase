import { act, render } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createRef, type RefObject } from 'react';

import type { UsePointerResult } from '.';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  Object.defineProperty(document, 'hidden', {
    value: false,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getHook() {
  const mod = await import('.');
  return mod.usePointer;
}

it('tracks an element mounted after the first commit', async () => {
  const usePointer = await getHook();
  let current: UsePointerResult<HTMLDivElement> | undefined;

  function Probe({ show }: { show: boolean }) {
    current = usePointer<HTMLDivElement>({
      onPointer: vi.fn(),
      visibility: 'ignore',
    });
    return show ? <div ref={current.ref} data-testid="target" /> : null;
  }

  const view = render(<Probe show={false} />);
  view.rerender(<Probe show />);
  act(() =>
    view.getByTestId('target').dispatchEvent(new Event('pointerenter')),
  );

  expect(current?.phase).toBe('tracking');
  expect(current?.stateRef.current.active).toBe(true);
});

it('releases a keyed element and resets phase and position refs', async () => {
  const usePointer = await getHook();
  let current: UsePointerResult<HTMLDivElement> | undefined;

  function Probe({ elementKey }: { elementKey: string }) {
    current = usePointer<HTMLDivElement>({
      onPointer: vi.fn(),
      visibility: 'ignore',
    });
    return <div key={elementKey} ref={current.ref} data-testid="target" />;
  }

  const view = render(<Probe elementKey="first" />);
  const first = view.getByTestId('target');
  act(() => first.dispatchEvent(new Event('pointerenter')));
  expect(current?.phase).toBe('tracking');

  view.rerender(<Probe elementKey="second" />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(current?.phase).toBe('idle');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.phaseRef.current).toBe('idle');
  expect(current?.phaseReasonRef.current).toBe('initial');
  expect(current?.stateRef.current).toEqual({ x: 0, y: 0, active: false });

  act(() => first.dispatchEvent(new Event('pointerenter')));
  expect(current?.phase).toBe('idle');
  act(() => second.dispatchEvent(new Event('pointerenter')));
  expect(current?.phase).toBe('tracking');
});

it('stops tracking on detach and resumes with a new element', async () => {
  const usePointer = await getHook();
  let current: UsePointerResult<HTMLDivElement> | undefined;

  function Probe({ show }: { show: boolean }) {
    current = usePointer<HTMLDivElement>({
      onPointer: vi.fn(),
      visibility: 'ignore',
    });
    return show ? <div ref={current.ref} data-testid="target" /> : null;
  }

  const view = render(<Probe show />);
  const first = view.getByTestId('target');
  act(() => first.dispatchEvent(new Event('pointerenter')));
  view.rerender(<Probe show={false} />);
  expect(current?.phase).toBe('idle');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.stateRef.current.active).toBe(false);

  view.rerender(<Probe show />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  act(() => second.dispatchEvent(new Event('pointerenter')));
  expect(current?.phase).toBe('tracking');
});

it('resets after a new ref object restarts tracking of the same element', async () => {
  const usePointer = await getHook();
  const firstRef = createRef<HTMLDivElement>();
  const secondRef = createRef<HTMLDivElement>();
  let current: UsePointerResult<HTMLDivElement> | undefined;

  function Probe({
    targetRef,
  }: {
    targetRef: RefObject<HTMLDivElement | null>;
  }) {
    current = usePointer<HTMLDivElement>({
      ref: targetRef,
      onPointer: vi.fn(),
    });
    return <div ref={targetRef} data-testid="target" />;
  }

  const view = render(<Probe targetRef={firstRef} />);
  const element = view.getByTestId('target');
  act(() => {
    mockIO.trigger(element, true);
    element.dispatchEvent(new Event('pointerenter'));
  });
  expect(current?.phase).toBe('tracking');

  view.rerender(<Probe targetRef={secondRef} />);
  expect(secondRef.current).toBe(element);
  expect(current?.phase).toBe('idle');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.stateRef.current.active).toBe(false);
});

it('adds no reconciliation render on plain mount', async () => {
  const usePointer = await getHook();
  let renders = 0;

  function Probe() {
    renders++;
    const { ref } = usePointer({ onPointer: vi.fn() });
    return <div ref={ref} data-testid="target" />;
  }

  const view = render(<Probe />, { reactStrictMode: false });
  expect(renders).toBe(1);
  expect(
    mockIO.instances.some((instance) =>
      instance.observed.has(view.getByTestId('target')),
    ),
  ).toBe(true);
});
