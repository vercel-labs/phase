import { act, renderHook, waitFor } from '@testing-library/react';
import { page } from 'vitest/browser';

import { useMediaQuery } from '.';

it('updates when the real viewport crosses a media query', async () => {
  await page.viewport(800, 600);
  const { result, unmount } = renderHook(() =>
    useMediaQuery('(max-width: 600px)'),
  );

  await waitFor(() => expect(result.current).toBe(false));
  await act(() => page.viewport(500, 600));
  await waitFor(() => expect(result.current).toBe(true));

  unmount();
  await page.viewport(800, 600);
});
