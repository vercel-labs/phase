// Browser event coverage lives in index.browser.spec.ts. Keep only deterministic
// React wiring and teardown scenarios here.
import { render, renderHook, act } from '@testing-library/react';
import { createRef, useRef, type RefObject } from 'react';

import { useRenderState } from '.';

function dispatchStateChange(element: Element, skipped: boolean): void {
  const event = new Event('contentvisibilityautostatechange');
  Object.defineProperty(event, 'skipped', { value: skipped });
  element.dispatchEvent(event);
}

describe('useRenderState', () => {
  it('returns rendered by default', () => {
    const el = document.createElement('div');
    const ref = { current: el } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useRenderState(ref));
    expect(result.current).toBe('rendered');
  });

  it('stops listening on unmount', () => {
    const el = document.createElement('div');
    const ref = { current: el } as RefObject<HTMLDivElement>;
    const { result, unmount } = renderHook(() => useRenderState(ref));

    unmount();
    act(() => dispatchStateChange(el, true));
    expect(result.current).toBe('rendered');
  });

  it('stays rendered when the ref is empty', () => {
    const ref = { current: null } as RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() => useRenderState(ref));
    expect(result.current).toBe('rendered');
  });

  it('observes an element mounted after the first commit', () => {
    function Probe({ show }: { show: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      const phase = useRenderState(ref);
      return (
        <>
          <output data-testid="phase">{phase}</output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show={false} />);
    view.rerender(<Probe show />);
    act(() => dispatchStateChange(view.getByTestId('target'), true));

    expect(view.getByTestId('phase').textContent).toBe('skipped');
  });

  it('resets phase and moves the listener to a keyed replacement', () => {
    function Probe({ elementKey }: { elementKey: string }) {
      const ref = useRef<HTMLDivElement>(null);
      const phase = useRenderState(ref);
      return (
        <>
          <output data-testid="phase">{phase}</output>
          <div key={elementKey} ref={ref} data-testid="target" />
        </>
      );
    }

    const view = render(<Probe elementKey="first" />);
    const first = view.getByTestId('target');
    act(() => dispatchStateChange(first, true));
    expect(view.getByTestId('phase').textContent).toBe('skipped');

    view.rerender(<Probe elementKey="second" />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    expect(view.getByTestId('phase').textContent).toBe('rendered');

    act(() => {
      dispatchStateChange(first, false);
      dispatchStateChange(first, true);
    });
    expect(view.getByTestId('phase').textContent).toBe('rendered');
    act(() => dispatchStateChange(second, true));
    expect(view.getByTestId('phase').textContent).toBe('skipped');
  });

  it('re-observes after collapse and re-expand', () => {
    function Probe({ show }: { show: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      const phase = useRenderState(ref);
      return (
        <>
          <output data-testid="phase">{phase}</output>
          {show ? <div ref={ref} data-testid="target" /> : null}
        </>
      );
    }

    const view = render(<Probe show />);
    const first = view.getByTestId('target');
    act(() => dispatchStateChange(first, true));
    expect(view.getByTestId('phase').textContent).toBe('skipped');

    view.rerender(<Probe show={false} />);
    expect(view.getByTestId('phase').textContent).toBe('rendered');
    act(() => {
      dispatchStateChange(first, false);
      dispatchStateChange(first, true);
    });
    expect(view.getByTestId('phase').textContent).toBe('rendered');

    view.rerender(<Probe show />);
    const second = view.getByTestId('target');
    expect(second).not.toBe(first);
    act(() => dispatchStateChange(second, true));
    expect(view.getByTestId('phase').textContent).toBe('skipped');
  });

  it('resets phase when a new ref restarts observation of the same element', () => {
    const firstRef = createRef<HTMLDivElement>();
    const secondRef = createRef<HTMLDivElement>();

    function Probe({
      targetRef,
    }: {
      targetRef: RefObject<HTMLDivElement | null>;
    }) {
      const phase = useRenderState(targetRef);
      return (
        <>
          <output data-testid="phase">{phase}</output>
          <div ref={targetRef} data-testid="target" />
        </>
      );
    }

    const view = render(<Probe targetRef={firstRef} />);
    const element = view.getByTestId('target');
    act(() => dispatchStateChange(element, true));

    view.rerender(<Probe targetRef={secondRef} />);
    expect(secondRef.current).toBe(element);
    expect(view.getByTestId('phase').textContent).toBe('rendered');

    act(() => dispatchStateChange(element, true));
    expect(view.getByTestId('phase').textContent).toBe('skipped');
    act(() => dispatchStateChange(element, false));
    expect(view.getByTestId('phase').textContent).toBe('rendered');
  });

  it('adds no reconciliation render on plain mount', () => {
    let renders = 0;
    function Probe() {
      renders++;
      const ref = useRef<HTMLDivElement>(null);
      useRenderState(ref);
      return <div ref={ref} />;
    }

    render(<Probe />, { reactStrictMode: false });
    expect(renders).toBe(1);
  });
});
