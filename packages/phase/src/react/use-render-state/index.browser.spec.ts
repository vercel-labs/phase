import { renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useRenderState } from '.';

it('updates React state from native content-visibility changes', async () => {
  const spacer = document.createElement('div');
  const target = document.createElement('div');
  spacer.style.height = '2000px';
  target.style.cssText =
    'content-visibility:auto;contain-intrinsic-size:100px;height:100px;';
  document.body.append(spacer, target);
  const ref = createRef<HTMLDivElement>();
  ref.current = target;
  const { result, unmount } = renderHook(() => useRenderState(ref));

  await waitFor(() => expect(result.current).toBe('skipped'));
  target.scrollIntoView();
  await waitFor(() => expect(result.current).toBe('rendered'));

  unmount();
  spacer.remove();
  target.remove();
  window.scrollTo(0, 0);
});
