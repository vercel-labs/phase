import { act, render } from '@testing-library/react';
import { createMockIntersectionObserver } from '@usephase/testing/intersection-observer';
import { createMockMutationObserver } from '@usephase/testing/mutation-observer';
import { createRef, type RefObject } from 'react';

import type { UseMutationResult } from '.';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMO: ReturnType<typeof createMockMutationObserver>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockMO = createMockMutationObserver();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('MutationObserver', mockMO.MockClass);
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
  return mod.useMutation;
}

function isObserved(element: Element): boolean {
  return mockIO.instances.some((instance) => instance.observed.has(element));
}

it('observes an element mounted after the first commit', async () => {
  const useMutation = await getHook();

  function Probe({ show }: { show: boolean }) {
    const { ref } = useMutation({
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    return show ? <div ref={ref} data-testid="target" /> : null;
  }

  const view = render(<Probe show={false} />);
  view.rerender(<Probe show />);
  const element = view.getByTestId('target');

  expect(isObserved(element)).toBe(true);
  act(() => mockIO.trigger(element, true));
  expect(mockMO.instances.some((instance) => instance.target === element)).toBe(
    true,
  );
});

it('releases a keyed element and resets its phase before observing the replacement', async () => {
  const useMutation = await getHook();
  let current: UseMutationResult<HTMLDivElement> | undefined;

  function Probe({ elementKey }: { elementKey: string }) {
    current = useMutation<HTMLDivElement>({
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    return <div key={elementKey} ref={current.ref} data-testid="target" />;
  }

  const view = render(<Probe elementKey="first" />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  expect(current?.phase).toBe('observing');

  view.rerender(<Probe elementKey="second" />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(first)).toBe(false);
  expect(isObserved(second)).toBe(true);
  expect(mockMO.instances.some((instance) => instance.target === first)).toBe(
    false,
  );
  expect(current?.phase).toBe('paused');
  expect(current?.phaseReason).toBe('initial');
  expect(current?.phaseRef.current).toBe('paused');
  expect(current?.phaseReasonRef.current).toBe('initial');

  act(() => mockIO.trigger(second, true));
  expect(mockMO.instances.some((instance) => instance.target === second)).toBe(
    true,
  );
});

it('releases a detached element and observes a new one after remount', async () => {
  const useMutation = await getHook();
  let current: UseMutationResult<HTMLDivElement> | undefined;

  function Probe({ show }: { show: boolean }) {
    current = useMutation<HTMLDivElement>({
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    return show ? <div ref={current.ref} data-testid="target" /> : null;
  }

  const view = render(<Probe show />);
  const first = view.getByTestId('target');
  act(() => mockIO.trigger(first, true));
  view.rerender(<Probe show={false} />);
  expect(isObserved(first)).toBe(false);
  expect(current?.phase).toBe('paused');
  expect(current?.phaseReason).toBe('initial');

  view.rerender(<Probe show />);
  const second = view.getByTestId('target');
  expect(second).not.toBe(first);
  expect(isObserved(second)).toBe(true);
});

it('resets after a new ref object restarts observation of the same element', async () => {
  const useMutation = await getHook();
  const firstRef = createRef<HTMLDivElement>();
  const secondRef = createRef<HTMLDivElement>();
  let current: UseMutationResult<HTMLDivElement> | undefined;

  function Probe({
    targetRef,
  }: {
    targetRef: RefObject<HTMLDivElement | null>;
  }) {
    current = useMutation<HTMLDivElement>({
      ref: targetRef,
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    return <div ref={targetRef} data-testid="target" />;
  }

  const view = render(<Probe targetRef={firstRef} />);
  const element = view.getByTestId('target');
  act(() => mockIO.trigger(element, true));
  expect(current?.phase).toBe('observing');

  view.rerender(<Probe targetRef={secondRef} />);
  expect(secondRef.current).toBe(element);
  expect(isObserved(element)).toBe(true);
  expect(current?.phase).toBe('paused');
  expect(current?.phaseReason).toBe('initial');
});

it('adds no reconciliation render on plain mount', async () => {
  const useMutation = await getHook();
  let renders = 0;

  function Probe() {
    renders++;
    const { ref } = useMutation({
      mutation: { childList: true },
      onMutations: vi.fn(),
    });
    return <div ref={ref} data-testid="target" />;
  }

  const view = render(<Probe />, { reactStrictMode: false });
  expect(renders).toBe(1);
  expect(isObserved(view.getByTestId('target'))).toBe(true);
});
