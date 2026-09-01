import { act, renderHook, waitFor } from '@testing-library/react';
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
