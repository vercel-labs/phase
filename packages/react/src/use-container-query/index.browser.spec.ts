import { act, renderHook, waitFor } from '@testing-library/react';
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
