import { act, render, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useSize } from '.';

it('updates from native ResizeObserver measurements', async () => {
  const target = document.createElement('div');
  target.style.cssText = 'width:100px;height:80px;';
  document.body.append(target);
  const ref = createRef<HTMLDivElement>();
  ref.current = target;
  const { result, unmount } = renderHook(() => useSize({ ref }));

  await waitFor(() =>
    expect(result.current.size).toEqual({ width: 100, height: 80 }),
  );
  act(() => {
    target.style.width = '160px';
  });
  await waitFor(() => expect(result.current.size?.width).toBe(160));

  unmount();
  target.remove();
});

it('tracks native measurements across conditional and keyed mounts', async () => {
  function Probe({
    show,
    elementKey,
    width,
  }: {
    show: boolean;
    elementKey: string;
    width: number;
  }) {
    const { ref, size } = useSize();
    return (
      <>
        <output data-testid="size">
          {size ? `${size.width}x${size.height}` : 'null'}
        </output>
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

  const view = render(<Probe show={false} elementKey="first" width={100} />);
  expect(view.getByTestId('size').textContent).toBe('null');

  view.rerender(<Probe show elementKey="first" width={100} />);
  const first = view.getByTestId('target');
  await waitFor(() =>
    expect(view.getByTestId('size').textContent).toBe('100x80'),
  );

  view.rerender(<Probe show elementKey="second" width={160} />);
  expect(view.getByTestId('target')).not.toBe(first);
  await waitFor(() =>
    expect(view.getByTestId('size').textContent).toBe('160x80'),
  );

  view.rerender(<Probe show={false} elementKey="second" width={160} />);
  expect(view.getByTestId('size').textContent).toBe('160x80');

  view.rerender(<Probe show elementKey="third" width={200} />);
  await waitFor(() =>
    expect(view.getByTestId('size').textContent).toBe('200x80'),
  );

  view.unmount();
});
