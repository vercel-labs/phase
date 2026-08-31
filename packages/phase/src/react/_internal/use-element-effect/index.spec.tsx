import { render } from '@testing-library/react';
import { createRef, StrictMode, useRef, type RefObject } from 'react';

import { useElementEffect } from '.';

describe('useElementEffect', () => {
  it('subscribes on mount without an extra render', () => {
    const effect = vi.fn();
    let renders = 0;

    function Probe() {
      renders++;
      const ref = useRef<HTMLDivElement>(null);
      useElementEffect(ref, effect, []);
      return <div ref={ref} />;
    }

    render(<Probe />, { reactStrictMode: false });

    expect(renders).toBe(1);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('reconciles a keyed element swap with one extra render', () => {
    const events: string[] = [];
    let renders = 0;

    function Probe({ elementKey }: { elementKey: string }) {
      renders++;
      const ref = useRef<HTMLDivElement>(null);
      useElementEffect(
        ref,
        (element) => {
          const id = element.dataset.id ?? '';
          events.push(`subscribe:${id}`);
          return () => events.push(`cleanup:${id}`);
        },
        [],
      );
      return <div key={elementKey} ref={ref} data-id={elementKey} />;
    }

    const view = render(<Probe elementKey="first" />, {
      reactStrictMode: false,
    });
    const beforeSwap = renders;
    view.rerender(<Probe elementKey="second" />);

    expect(renders).toBe(beforeSwap + 2);
    expect(events).toEqual([
      'subscribe:first',
      'cleanup:first',
      'subscribe:second',
    ]);
  });

  it('subscribes when an element mounts after the first commit', () => {
    const effect = vi.fn();

    function Probe({ show }: { show: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useElementEffect(ref, effect, []);
      return show ? <div ref={ref} /> : null;
    }

    const view = render(<Probe show={false} />);
    expect(effect).not.toHaveBeenCalled();

    view.rerender(<Probe show />);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('keeps subscriptions balanced through StrictMode effect replay', () => {
    let activeSubscriptions = 0;
    let subscriptions = 0;
    let cleanups = 0;

    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      useElementEffect(ref, () => {
        activeSubscriptions++;
        subscriptions++;
        return () => {
          activeSubscriptions--;
          cleanups++;
        };
      }, []);
      return <div ref={ref} />;
    }

    const view = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    expect(activeSubscriptions).toBe(1);
    expect(subscriptions).toBe(cleanups + 1);

    view.unmount();
    expect(activeSubscriptions).toBe(0);
    expect(subscriptions).toBe(cleanups);
  });

  it('uses the latest effect when dependencies change without reconciling', () => {
    const events: string[] = [];
    let renders = 0;

    function Probe({ dependency }: { dependency: string }) {
      renders++;
      const ref = useRef<HTMLDivElement>(null);
      useElementEffect(ref, () => {
        events.push(`subscribe:${dependency}`);
        return () => events.push(`cleanup:${dependency}`);
      }, [dependency]);
      return <div ref={ref} />;
    }

    const view = render(<Probe dependency="first" />, {
      reactStrictMode: false,
    });
    const beforeChange = renders;
    view.rerender(<Probe dependency="second" />);

    expect(renders).toBe(beforeChange + 1);
    expect(events).toEqual([
      'subscribe:first',
      'cleanup:first',
      'subscribe:second',
    ]);
  });

  it('resubscribes when the ref object changes for the same element', () => {
    const firstRef = createRef<HTMLDivElement>();
    const secondRef = createRef<HTMLDivElement>();
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);

    function Probe({
      targetRef,
    }: {
      targetRef: RefObject<HTMLDivElement | null>;
    }) {
      useElementEffect(targetRef, effect, []);
      return <div ref={targetRef} />;
    }

    const view = render(<Probe targetRef={firstRef} />, {
      reactStrictMode: false,
    });
    const element = firstRef.current;
    view.rerender(<Probe targetRef={secondRef} />);

    expect(secondRef.current).toBe(element);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(2);
  });
});
