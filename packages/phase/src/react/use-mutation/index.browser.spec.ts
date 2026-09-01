import { renderHook } from '@testing-library/react';
import { createRef } from 'react';

import { useMutation } from '.';

it('delivers native mutation records through the React hook', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const ref = createRef<HTMLDivElement>();
  ref.current = target;
  const callback = vi.fn();
  const { unmount } = renderHook(() =>
    useMutation({
      ref,
      mutation: { childList: true },
      visibility: 'ignore',
      onMutations: callback,
    }),
  );

  target.append(document.createElement('span'));
  await vi.waitFor(() => expect(callback).toHaveBeenCalled());

  unmount();
  target.remove();
});
