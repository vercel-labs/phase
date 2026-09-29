import { act, render, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useContainerQuery } from '.';

it('reacts to native container breakpoint crossings', async () => {
  const target = document.createElement('div');
  target.style.cssText = 'width:100px;height:80px;';
  document.body.append(target);
  const ref = createRef<HTMLDivElement>();
  ref.current = target;
  const { result, unmount } = renderHook(() =>
    useContainerQuery({ minWidth: 150 }, { ref }),
  );

  await waitFor(() => expect(result.current.matches).toBe(false));
  act(() => {
    target.style.width = '200px';
  });
  await waitFor(() => expect(result.current.matches).toBe(true));
  act(() => {
    target.style.width = '100px';
  });
  await waitFor(() => expect(result.current.matches).toBe(false));

  unmount();
  target.remove();
});

it('tracks native matches across conditional and keyed mounts', async () => {
  function Probe({
    show,
    elementKey,
    width,
  }: {
    show: boolean;
    elementKey: string;
    width: number;
  }) {
    const { ref, matches } = useContainerQuery({ minWidth: 150 });
    return (
      <>
        <output data-testid="matches">{String(matches)}</output>
        {show ? (
          <div
            key={elementKey}
            ref={ref}
            data-testid="target"
            style={{ width, height: 80 }}
          />
        ) : null}
      </>
    );
  }

  const view = render(<Probe show={false} elementKey="first" width={200} />);
  expect(view.getByTestId('matches').textContent).toBe('false');

  view.rerender(<Probe show elementKey="first" width={200} />);
  const first = view.getByTestId('target');
  await waitFor(() =>
    expect(view.getByTestId('matches').textContent).toBe('true'),
  );

  view.rerender(<Probe show elementKey="second" width={100} />);
  expect(view.getByTestId('target')).not.toBe(first);
  await waitFor(() =>
    expect(view.getByTestId('matches').textContent).toBe('false'),
  );

  view.rerender(<Probe show={false} elementKey="second" width={100} />);
  expect(view.getByTestId('matches').textContent).toBe('false');

  view.rerender(<Probe show elementKey="third" width={200} />);
  await waitFor(() =>
    expect(view.getByTestId('matches').textContent).toBe('true'),
  );

  view.unmount();
});
