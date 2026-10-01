import { act, render } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createMockResizeObserver } from '@usephase/testing/resize-observer';
import { createRef, useLayoutEffect, type RefObject } from 'react';

import type { UseScrollResult } from '.';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockRO: ReturnType<typeof createMockResizeObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockRO = createMockResizeObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('ResizeObserver', mockRO.MockClass);
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
  return mod.useScroll;
}

function isObserved(element: Element): boolean {
  return mockIO.instances.some((instance) => instance.observed.has(element));
}

function makeScrollable(element: Element, width: number): void {
  Object.defineProperties(element, {
    scrollWidth: { value: width, configurable: true },
    clientWidth: { value: 100, configurable: true },
    scrollHeight: { value: 100, configurable: true },
    clientHeight: { value: 100, configurable: true },
    scrollLeft: { value: 0, writable: true, configurable: true },
    scrollTop: { value: 0, writable: true, configurable: true },
  });
}

it('tracks an element mounted after the first commit', async () => {
  const useScroll = await getHook();
  let current: UseScrollResult<HTMLDivElement> | undefined;

  function Probe({ show }: { show: boolean }) {
    current = useScroll<HTMLDivElement>({
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    useLayoutEffect(() => {
      if (current?.ref.current) makeScrollable(current.ref.current, 400);
    }, [show]);
    return show ? <div ref={current.ref} data-testid="target" /> : null;
  }

  const view = render(<Probe show={false} />);
  view.rerender(<Probe show />);
  expect(current?.stateRef.current.maxX).toBe(300);
  expect(current?.phase).toBe('tracking');
});

it('releases a keyed element and resets phase and scroll state', async () => {
  const useScroll = await getHook();
  let current: UseScrollResult<HTMLDivElement> | undefined;

  function Probe({ elementKey }: { elementKey: string }) {
    current = useScroll<HTMLDivElement>({ onScroll: vi.fn() });
    useLayoutEffect(() => {
      if (current?.ref.current)
        makeScrollable(current.ref.current, elementKey === 'first' ? 400 : 700);
    }, [elementKey]);
    return <div key={elementKey} ref={current.ref} data-testid="target" />;
  }

  const view = render(<Probe elementKey="first" />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  expect(current?.stateRef.current.maxX).toBe(300);

  view.rerender(<Probe elementKey="second" />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(first)).toBe(false);
  expect(isObserved(second)).toBe(true);
  expect(current?.phase).toBe('paused');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.phaseRef.current).toBe('paused');
  expect(current?.phaseReasonRef.current).toBe('initial');
  expect(current?.stateRef.current.maxX).toBe(0);
  expect(current?.stateRef.current.x).toBe(0);

  act(() => mockIO.trigger(second, true));
  expect(current?.stateRef.current.maxX).toBe(600);
  expect(current?.phase).toBe('tracking');
});

it('resets on detach and observes a new element after remount', async () => {
  const useScroll = await getHook();
  let current: UseScrollResult<HTMLDivElement> | undefined;

  function Probe({ show }: { show: boolean }) {
    current = useScroll<HTMLDivElement>({ onScroll: vi.fn() });
    return show ? <div ref={current.ref} data-testid="target" /> : null;
  }

  const view = render(<Probe show />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  view.rerender(<Probe show={false} />);
  expect(isObserved(first)).toBe(false);
  expect(current?.phase).toBe('paused');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.stateRef.current.maxX).toBe(0);

  view.rerender(<Probe show />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(second)).toBe(true);
});

it('resets after a new ref object restarts tracking of the same element', async () => {
  const useScroll = await getHook();
  const firstRef = createRef<HTMLDivElement>();
  const secondRef = createRef<HTMLDivElement>();
  let current: UseScrollResult<HTMLDivElement> | undefined;

  function Probe({
    targetRef,
  }: {
    targetRef: RefObject<HTMLDivElement | null>;
  }) {
    current = useScroll<HTMLDivElement>({ ref: targetRef, onScroll: vi.fn() });
    useLayoutEffect(() => {
      if (targetRef.current) makeScrollable(targetRef.current, 400);
    }, [targetRef]);
    return <div ref={targetRef} data-testid="target" />;
  }

  const view = render(<Probe targetRef={firstRef} />);
  const element = view.getByTestId('target');
  act(() => mockIO.trigger(element, true));
  expect(current?.stateRef.current.maxX).toBe(300);

  view.rerender(<Probe targetRef={secondRef} />);
  expect(secondRef.current).toBe(element);
  expect(isObserved(element)).toBe(true);
  expect(current?.phase).toBe('paused');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.stateRef.current.maxX).toBe(0);
});

it('keeps page measurement live after switching from an element', async () => {
  const useScroll = await getHook();
  makeScrollable(document.documentElement, 500);
  let current: UseScrollResult<HTMLDivElement> | undefined;

  function Probe({ page }: { page: boolean }) {
    current = useScroll<HTMLDivElement>({
      target: page ? 'page' : undefined,
      onScroll: vi.fn(),
      visibility: 'ignore',
    });
    useLayoutEffect(() => {
      if (!page && current?.ref.current)
        makeScrollable(current.ref.current, 400);
    }, [page]);
    return <div ref={current.ref} />;
  }

  const view = render(<Probe page={false} />);
  expect(current?.stateRef.current.maxX).toBe(300);

  view.rerender(<Probe page />);
  expect(current?.stateRef.current.maxX).toBe(400);

  makeScrollable(document.documentElement, 800);
  act(() => current?.measure());
  expect(current?.stateRef.current.maxX).toBe(700);
});

it('adds no reconciliation render on plain mount', async () => {
  const useScroll = await getHook();
  let renders = 0;

  function Probe() {
    renders++;
    const { ref } = useScroll({ onScroll: vi.fn() });
    return <div ref={ref} data-testid="target" />;
  }

  const view = render(<Probe />, { reactStrictMode: false });
  expect(renders).toBe(1);
  expect(isObserved(view.getByTestId('target'))).toBe(true);
});
